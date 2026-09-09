"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { STAGES } from "@/lib/stages";
import { formatWhen, money, nowIso, phonePretty, uid } from "@/lib/format";
import { cascadeDeleteLead } from "@/lib/crm";
import { archiveLead, contactTimeline, findDuplicateLeads, relatedFor, restoreLead } from "@/lib/contacts";
import { blankLoadFromLead, companyName, generateFollowUp, generateOpeningMessage, hasMeasuredSpecs, leadLocation, openQuoteShipment, shipmentMargin, summarizeProspect, CLIENT_KINDS } from "@/lib/freight";
import { applySpecsToLead, parseDimensions, parsePounds, recommendEquipment } from "@/lib/equipment";
import { attachCarrierToShipment, carrierLabel } from "@/lib/carriers";
import { wrapCall, type CallOutcome } from "@/lib/prospect";
import { browserTelephony } from "@/lib/telephony";
import { parseMoney } from "@/lib/validate";
import type { Lead, Priority, Shipment } from "@/lib/types";

type Tab = "intel" | "record" | "quote" | "activity";

const TABS: { id: Tab; label: string }[] = [
  { id: "intel", label: "Intelligence" },
  { id: "record", label: "Record" },
  { id: "quote", label: "Quote" },
  { id: "activity", label: "Activity" },
];

type Draft = {
  name: string;
  property: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  website: string;
  listingUrl: string;
  sellerUrl: string;
  status: string;
  priority: Priority;
  owner: string;
  source: string;
  nextAction: string;
  notes: string;
  category: string;
  equipmentType: string;
  origin: string;
  destination: string;
  label: string;
  booker: string;
  bookerPhone: string;
  dimensions: string;
  weight: string;
};

function draftFrom(lead: Lead): Draft {
  return {
    name: lead.name,
    property: companyName(lead),
    phone: lead.phone,
    email: lead.email,
    city: lead.city,
    state: lead.state || "",
    website: lead.website || "",
    listingUrl: lead.listingUrl || "",
    sellerUrl: lead.sellerUrl || "",
    status: lead.status,
    priority: lead.priority,
    owner: lead.owner,
    source: lead.source,
    nextAction: lead.nextAction,
    notes: lead.notes,
    category: lead.category || "",
    equipmentType: lead.equipmentType || "",
    origin: lead.origin || "",
    destination: lead.destination || "",
    label: lead.label || "Unlabeled",
    booker: lead.booker || "",
    bookerPhone: lead.bookerPhone || "",
    dimensions: lead.dimensions || "",
    weight: lead.weight || "",
  };
}

function sheetFromLead(lead: Lead, shipment: Shipment | null) {
  const blank = blankLoadFromLead(lead);
  const src = shipment || blank;
  return {
    origin: src.origin,
    destination: src.destination,
    dimensions: src.dimensions || lead.dimensions || "",
    weight: src.weight || lead.weight || "",
    equipmentType: src.equipmentType || lead.trailerHint || "",
    customerRate: src.customerRate ? String(src.customerRate) : "",
    carrierRate: src.carrierRate ? String(src.carrierRate) : "",
    carrierId: src.carrierId || "",
    notes: src.notes || "",
    pickupNotes: src.pickupNotes || "",
    destNotes: src.destNotes || "",
    appointmentPickup: Boolean(src.appointmentPickup),
  };
}

export function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const router = useRouter();
  const { workspace, setWorkspace, log, setSelectedLeadId } = useWorkspace();
  const live = workspace.leads.find((item) => item.id === lead.id) || lead;
  const [tab, setTab] = useState<Tab>("intel");
  const [draft, setDraft] = useState<Draft>(() => draftFrom(live));
  const [callNote, setCallNote] = useState("");
  const [callOutcome, setCallOutcome] = useState("connected");
  const [quoteMsg, setQuoteMsg] = useState("");
  const [sheet, setSheet] = useState(() => sheetFromLead(live, openQuoteShipment(workspace, live.id)));

  useEffect(() => {
    setDraft(draftFrom(live));
    setSheet(sheetFromLead(live, openQuoteShipment(workspace, live.id)));
    setQuoteMsg("");
    setTab("intel");
  }, [live.id]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(live));
  const duplicates = useMemo(
    () => findDuplicateLeads(workspace.leads, { id: live.id, phone: draft.phone, email: draft.email }),
    [workspace.leads, live.id, draft.phone, draft.email],
  );
  const timeline = useMemo(() => contactTimeline(workspace, live.id), [workspace, live.id]);
  const related = useMemo(() => relatedFor(workspace, live.id), [workspace, live.id]);
  const analysis = related.analysis || (workspace.analyses || []).find((item) => item.leadId === live.id);
  const listings = related.listings || [];
  const company = related.company;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function requestClose() {
    if (dirty && !confirm("Discard unsaved changes to this client?")) return;
    onClose();
  }

  function save(event?: React.FormEvent) {
    event?.preventDefault();
    const stamp = nowIso();
    setWorkspace((prev) => ({
      ...prev,
      leads: prev.leads.map((item) => {
        if (item.id !== live.id) return item;
        const next = {
          ...item,
          name: draft.name.trim() || item.name,
          property: draft.property,
          company: draft.property,
          phone: draft.phone,
          email: draft.email,
          city: draft.city,
          state: draft.state,
          website: draft.website,
          listingUrl: draft.listingUrl,
          sellerUrl: draft.sellerUrl,
          status: draft.status,
          priority: draft.priority,
          owner: draft.owner,
          source: draft.source,
          nextAction: draft.nextAction,
          notes: draft.notes,
          category: draft.category,
          equipmentType: draft.equipmentType,
          origin: draft.origin,
          destination: draft.destination,
          booker: draft.booker,
          bookerPhone: draft.bookerPhone,
          label: draft.label === "Unlabeled" ? "" : draft.label,
          updatedAt: stamp,
        };
        const parsed = parseDimensions(draft.dimensions);
        const weightLbs = parsePounds(draft.weight);
        if (parsed.lengthFt != null || parsed.heightFt != null || weightLbs != null) {
          const result = applySpecsToLead(next, {
            unit: draft.equipmentType,
            lengthFt: parsed.lengthFt,
            widthFt: parsed.widthFt,
            heightFt: parsed.heightFt,
            weightLbs,
          });
          return result.saved ? result.lead : { ...next, dimensions: draft.dimensions, weight: draft.weight };
        }
        return { ...next, dimensions: draft.dimensions.trim(), weight: draft.weight.trim() };
      }),
      opportunities: prev.opportunities.map((item) =>
        item.leadId === live.id
          ? { ...item, stage: draft.status, name: draft.name.trim() || item.name, property: draft.property, origin: draft.origin, destination: draft.destination, updatedAt: stamp }
          : item,
      ),
      updatedAt: stamp,
    }));
    log("lead", live.id, "updated", "Client saved");
  }

  function archive() {
    if (dirty && !confirm("Archive without saving edits?")) return;
    if (!confirm("Archive this client?")) return;
    setWorkspace((prev) => archiveLead(prev, live.id));
    log("lead", live.id, "archived", "Client archived");
    onClose();
  }

  function restore() {
    setWorkspace((prev) => restoreLead(prev, live.id));
    log("lead", live.id, "restored", "Client restored");
  }

  function remove() {
    if (!confirm("Permanently delete this client and linked deals, listings, follow-ups, quotes, and shipments?")) return;
    setWorkspace((prev) => cascadeDeleteLead(prev, live.id));
    log("lead", live.id, "deleted", "Client deleted");
    onClose();
  }

  function logCall() {
    const map: Record<string, CallOutcome> = {
      connected: "talked",
      no_answer: "no_pickup",
      voicemail: "voicemail",
      not_interested: "no_pickup",
      wrong_number: "wrong_number",
    };
    const outcome = map[callOutcome] || "talked";
    setWorkspace((prev) => wrapCall(prev, live.id, outcome, { notes: callNote }));
    log("lead", live.id, "call", `Call logged: ${callOutcome}${callNote ? ` · ${callNote}` : ""}`);
    setCallNote("");
  }

  function saveQuoteSheet(event?: React.FormEvent) {
    event?.preventDefault();
    const customerRate = parseMoney(sheet.customerRate === "" ? 0 : sheet.customerRate);
    const carrierRate = parseMoney(sheet.carrierRate === "" ? 0 : sheet.carrierRate);
    if (customerRate == null || carrierRate == null) {
      setQuoteMsg("Rates must be numbers. Leave them blank until you have a real quote.");
      return;
    }
    const stamp = nowIso();
    const existing = openQuoteShipment(workspace, live.id);
    const attached = (workspace.carriers || []).find((item) => item.id === sheet.carrierId);
    let item: Shipment = {
      ...blankLoadFromLead(live, { destination: sheet.destination, contact: live.booker || live.name }),
      origin: sheet.origin.trim(),
      destination: sheet.destination.trim(),
      dimensions: sheet.dimensions.trim(),
      weight: sheet.weight.trim(),
      equipmentType: sheet.equipmentType.trim(),
      notes: sheet.notes.trim(),
      customerRate,
      carrierRate,
      id: existing?.id || uid("shp"),
      createdAt: existing?.createdAt || stamp,
      updatedAt: stamp,
      pickupDate: existing?.pickupDate || "",
      deliveryDate: existing?.deliveryDate || "",
      reference: existing?.reference || "",
      loadNumber: existing?.loadNumber || "",
      podReceived: existing?.podReceived || false,
      tracking: existing?.tracking || [],
      pickupNotes: sheet.pickupNotes.trim(),
      destNotes: sheet.destNotes.trim(),
      appointmentPickup: sheet.appointmentPickup,
      status: existing?.status && existing.status !== "Quote" ? existing.status : "Quote",
    };
    if (attached) item = attachCarrierToShipment(item, attached);
    const quoted = customerRate > 0;
    setWorkspace((prev) => ({
      ...prev,
      shipments: existing
        ? (prev.shipments || []).map((row) => (row.id === item.id ? item : row))
        : [item, ...(prev.shipments || [])],
      kpiEvents: quoted
        ? [{ id: uid("kpi"), type: "quote_sent", leadId: live.id, at: stamp, detail: String(customerRate) }, ...(prev.kpiEvents || [])]
        : prev.kpiEvents,
      leads: prev.leads.map((row) =>
        row.id === live.id
          ? {
              ...row,
              origin: sheet.origin.trim() || row.origin,
              destination: sheet.destination.trim() || row.destination,
              status: quoted ? "Quote Sent" : row.status === "Quote Sent" ? row.status : "Quote Requested",
              nextAction: quoted ? "Quoted. Cover with a carrier on file." : "Blank quote open. Rates stay 0 until they give a number.",
              updatedAt: stamp,
            }
          : row,
      ),
      opportunities: prev.opportunities.map((row) =>
        row.leadId === live.id
          ? {
              ...row,
              origin: item.origin,
              destination: item.destination,
              value: quoted ? customerRate : 0,
              stage: quoted ? "Quote Sent" : "Quote Requested",
              updatedAt: stamp,
            }
          : row,
      ),
      updatedAt: stamp,
    }));
    setQuoteMsg(quoted ? `Saved ${money(customerRate)} on this yard. Listing ask was not used.` : "Blank quote saved. Rates still $0.");
    log("shipment", item.id, existing ? "updated" : "created", quoted ? `Quoted ${customerRate}` : "Blank quote");
  }

  const opener = analysis ? generateOpeningMessage(analysis, "Casual", live.id) : generateFollowUp(live);
  const fit = recommendEquipment({
    text: [live.equipmentType, live.listingTitle, live.listingDescription].filter(Boolean).join(" "),
    dimensions: live.dimensions,
    weight: live.weight,
  });

  return (
    <div className="az-overlay" onClick={requestClose}>
      <aside className="az-drawer rec-drawer" onClick={(event) => event.stopPropagation()}>
        <header className="rec-head">
          <div>
            <div className="az-kicker">{live.source}</div>
            <h2>{live.name}</h2>
            <div className="rec-meta">
              <span className="az-chip">{live.label || "Unlabeled"}</span>
              <span className="az-chip">{live.status}</span>
              <span>
                Screen {live.freightScore ?? "—"}/100
              </span>
              <span>{leadLocation(live) || "Location unset"}</span>
            </div>
          </div>
          <button className="az-btn ghost" type="button" onClick={requestClose}>
            Close
          </button>
        </header>

        <div className="rec-actions">
          <button className="az-btn pri sm" type="button" onClick={() => { setSelectedLeadId(live.id); router.push(`/outreach?id=${live.id}`); }}>
            Work this
          </button>
          {live.listingUrl ? (
            <a className="az-btn sm" href={live.listingUrl} target="_blank" rel="noreferrer">
              Open listing
            </a>
          ) : null}
          {live.phone ? (
            <button className="az-btn sm" type="button" onClick={() => browserTelephony().startCall(live.phone)}>
              Call {phonePretty(live.phone)}
            </button>
          ) : null}
          <button className="az-btn sm" type="button" onClick={() => { setSheet(sheetFromLead(live, openQuoteShipment(workspace, live.id))); setTab("quote"); }}>
            Blank quote
          </button>
        </div>

        <div className="rec-tabs" role="tablist">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "on" : ""} onClick={() => {
              setTab(item.id);
              if (item.id === "quote") setSheet(sheetFromLead(live, openQuoteShipment(workspace, live.id)));
            }}>
              {item.label}
              {item.id === "activity" ? ` ${timeline.length}` : ""}
            </button>
          ))}
        </div>

        {tab === "intel" ? (
          <section className="rec-list">
            <h3>Label</h3>
            <div className="label-chips">
              {CLIENT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`az-btn sm ${(live.label || "Unlabeled") === kind ? "pri" : ""}`}
                  onClick={() => {
                    const stamp = nowIso();
                    const next = kind === "Unlabeled" ? "" : kind;
                    setWorkspace((prev) => ({
                      ...prev,
                      leads: prev.leads.map((item) => (item.id === live.id ? { ...item, label: next, updatedAt: stamp } : item)),
                      updatedAt: stamp,
                    }));
                    set("label", kind);
                  }}
                >
                  {kind}
                </button>
              ))}
            </div>
            <h3>Opportunity intelligence</h3>
            <p>{summarizeProspect(workspace, live)}</p>
            <div className="freight-intel-grid">
              <div>
                <span>Freight type</span>
                <b>{live.freightType || "Unknown"}</b>
              </div>
              <div>
                <span>Who they are</span>
                <b>{live.shipperRole || analysis?.shipperRole || "Unknown"}</b>
              </div>
              <div>
                <span>Trailer</span>
                <b>{hasMeasuredSpecs(live) ? live.trailerHint || `${fit.trailerName} · ${fit.loadClass}` : "Ask on the call"}</b>
              </div>
              <div>
                <span>Recurring</span>
                <b>{live.recurringPotential || "—"}</b>
              </div>
              <div>
                <span>Lane</span>
                <b>
                  {live.origin || live.city || "—"} → {live.destination || "—"}
                </b>
              </div>
            </div>
            <p className="cd-mono">
              {hasMeasuredSpecs(live)
                ? fit.why
                : "Ask length, height on the deck, and pounds before you pick a trailer. Save them on Intel or this record."}
            </p>
            {analysis ? (
              <>
                <h3>Known</h3>
                <p>{analysis.known.join(" · ") || "—"}</p>
                <h3>AI estimate</h3>
                <p>{analysis.estimates.join(" · ") || "None"}</p>
                <h3>Unknown</h3>
                <p>{analysis.unknown.join(" · ") || "—"}</p>
              </>
            ) : null}
            <h3>Listings / signals</h3>
            {company?.recurringCandidate ? (
              <p className="rec-warn">
                {company.name} has {company.listingCount} listings ({company.categories.join(", ") || "mixed"}). This may be significantly more valuable than a one-time shipment.
              </p>
            ) : null}
            {listings.length === 0 ? <p className="rec-empty">No listings attached yet.</p> : null}
            {listings.map((item) => (
              <div key={item.id} className="rec-row">
                <b>{item.title}</b>
                <p>
                  {item.source} · {item.askingPrice != null ? `Their ask ${money(item.askingPrice)}` : "No ask listed"} · {item.city} {item.state}
                </p>
                {item.sourceUrl ? (
                  <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                ) : null}
              </div>
            ))}
            <h3>Suggested opener</h3>
            <p>{opener}</p>
            <button
              className="az-btn sm"
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(opener);
                log("lead", live.id, "copied_opener", "Copied suggested opener");
              }}
            >
              Copy message
            </button>
            <h3>Log a call</h3>
            <div className="rec-grid">
              <select className="az-select" value={callOutcome} onChange={(event) => setCallOutcome(event.target.value)}>
                {["connected", "no_answer", "voicemail", "not_interested", "wrong_number"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <input className="az-input" value={callNote} onChange={(event) => setCallNote(event.target.value)} placeholder="Call notes" />
            </div>
            <button className="az-btn sm" type="button" onClick={logCall}>
              Save call
            </button>
            <h3>Quote</h3>
            <p className="cd-mono">
              One worksheet on this yard. Rates start empty. Saved Intel specs come with it. Listing ask is never the rate.
            </p>
            <button className="az-btn pri sm" type="button" onClick={() => { setSheet(sheetFromLead(live, openQuoteShipment(workspace, live.id))); setTab("quote"); }}>
              Open quote sheet
            </button>
            {(related.shipments || []).slice(0, 3).map((item) => (
              <div key={item.id} className="rec-row">
                <b>{item.status}</b>
                <p>
                  {item.origin} → {item.destination} · {item.customerRate ? money(item.customerRate) : "rate unset"}
                </p>
              </div>
            ))}
          </section>
        ) : null}

        {tab === "quote" ? (
          <form className="rec-form" onSubmit={saveQuoteSheet}>
            <p className="cd-mono">
              Type a number you actually quoted. {live.askingPrice != null ? `Their listing ask ${money(live.askingPrice)} stays on the listing — it is not this rate.` : "No listing ask on file."}
            </p>
            {hasMeasuredSpecs(live) ? (
              <p className="cd-mono">Pulled saved Intel specs. Change them here only if the load changed.</p>
            ) : (
              <p className="rec-warn">No saved L × W × H yet. Type what they told you, or leave blank and save specs in Intel.</p>
            )}
            <div className="rec-grid">
              <Field label="Origin" value={sheet.origin} onChange={(value) => setSheet((prev) => ({ ...prev, origin: value }))} />
              <Field label="Destination" value={sheet.destination} onChange={(value) => setSheet((prev) => ({ ...prev, destination: value }))} />
            </div>
            <div className="rec-grid">
              <Field label="Pickup notes" value={sheet.pickupNotes} onChange={(value) => setSheet((prev) => ({ ...prev, pickupNotes: value }))} />
              <Field label="Delivery notes" value={sheet.destNotes} onChange={(value) => setSheet((prev) => ({ ...prev, destNotes: value }))} />
            </div>
            <label className="rec-field">
              <input type="checkbox" checked={sheet.appointmentPickup} onChange={(event) => setSheet((prev) => ({ ...prev, appointmentPickup: event.target.checked }))} /> Pickup appointment required
            </label>
            <div className="rec-grid">
              <Field label="Dims (L × W × H)" value={sheet.dimensions} onChange={(value) => setSheet((prev) => ({ ...prev, dimensions: value }))} />
              <Field label="Weight (lb)" value={sheet.weight} onChange={(value) => setSheet((prev) => ({ ...prev, weight: value }))} />
            </div>
            <Field label="Trailer" value={sheet.equipmentType} onChange={(value) => setSheet((prev) => ({ ...prev, equipmentType: value }))} />
            <p className="cd-mono">{fit.trailerName} · {fit.loadClass}. {fit.why}</p>
            <div className="rec-grid">
              <label className="rec-field">
                Customer rate
                <input
                  className="az-input"
                  type="number"
                  min={0}
                  value={sheet.customerRate}
                  placeholder="Blank until you quoted"
                  onChange={(event) => setSheet((prev) => ({ ...prev, customerRate: event.target.value }))}
                />
              </label>
              <label className="rec-field">
                Carrier cost
                <input
                  className="az-input"
                  type="number"
                  min={0}
                  value={sheet.carrierRate}
                  placeholder="Blank until you have a cost"
                  onChange={(event) => setSheet((prev) => ({ ...prev, carrierRate: event.target.value }))}
                />
              </label>
            </div>
            <p className="cd-mono">
              {Number(sheet.customerRate) || Number(sheet.carrierRate)
                ? `Gross margin ${money(shipmentMargin(Number(sheet.customerRate) || 0, Number(sheet.carrierRate) || 0))}`
                : "Margin stays empty until both sides have a number you were given."}
            </p>
            <label className="rec-field">
              Carrier on file
              <select
                className="az-select"
                value={sheet.carrierId}
                onChange={(event) => setSheet((prev) => ({ ...prev, carrierId: event.target.value }))}
              >
                <option value="">None yet — paste a page on Shipments</option>
                {(workspace.carriers || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {carrierLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="rec-field">
              Notes
              <textarea className="az-area" value={sheet.notes} onChange={(event) => setSheet((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
            {quoteMsg ? <p className="cd-mono">{quoteMsg}</p> : null}
            <div className="rec-save">
              <button className="az-btn pri" type="submit">
                Save quote
              </button>
              {openQuoteShipment(workspace, live.id)?.status === "Quote" ? (
                <button
                  className="az-btn"
                  type="button"
                  onClick={() => {
                    const current = openQuoteShipment(workspace, live.id);
                    if (!current) {
                      setQuoteMsg("Save the quote first.");
                      return;
                    }
                    setWorkspace((prev) => {
                      const result = convertQuoteToLoad(prev, current.id);
                      if (!result.ok) {
                        setQuoteMsg(result.error);
                        return prev;
                      }
                      setQuoteMsg(`${result.shipment.loadNumber} is a load. Cover it on Shipments.`);
                      log("shipment", result.shipment.id, "converted", result.shipment.loadNumber || "");
                      return result.workspace;
                    });
                  }}
                >
                  Customer accepted — open load
                </button>
              ) : null}
              <button className="az-btn" type="button" onClick={() => { setSelectedLeadId(live.id); router.push("/shipments"); }}>
                Open Shipments
              </button>
            </div>
          </form>
        ) : null}

        {tab === "record" ? (
          <form className="rec-form" onSubmit={save}>
            {duplicates.length ? (
              <p className="rec-warn">Same phone or email as {duplicates.map((item) => item.name).join(", ")}.</p>
            ) : null}
            <label className="rec-field">
              Label
              <select className="az-select" value={draft.label} onChange={(event) => set("label", event.target.value)}>
                {CLIENT_KINDS.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <Field label="Name" value={draft.name} onChange={(value) => set("name", value)} />
            <Field label="Company / seller" value={draft.property} onChange={(value) => set("property", value)} />
            <div className="rec-grid">
              <Field label="Phone" value={draft.phone} onChange={(value) => set("phone", value)} />
              <Field label="Email" value={draft.email} onChange={(value) => set("email", value)} type="email" />
            </div>
            <div className="rec-grid">
              <Field label="City" value={draft.city} onChange={(value) => set("city", value)} />
              <Field label="State" value={draft.state} onChange={(value) => set("state", value)} />
            </div>
            <div className="rec-grid">
              <Field label="Who books freight" value={draft.booker || ""} onChange={(value) => set("booker", value)} />
              <Field label="Booker phone" value={draft.bookerPhone || ""} onChange={(value) => set("bookerPhone", value)} />
            </div>
            <div className="rec-grid">
              <Field label="Category" value={draft.category} onChange={(value) => set("category", value)} />
              <Field label="Equipment" value={draft.equipmentType} onChange={(value) => set("equipmentType", value)} />
            </div>
            <div className="rec-grid">
              <Field label="Origin" value={draft.origin} onChange={(value) => set("origin", value)} />
              <Field label="Destination" value={draft.destination} onChange={(value) => set("destination", value)} />
            </div>
            <div className="rec-grid">
              <Field label="Dims (L × W × H)" value={draft.dimensions} onChange={(value) => set("dimensions", value)} />
              <Field label="Weight (lb)" value={draft.weight} onChange={(value) => set("weight", value)} />
            </div>
            <Field label="Website" value={draft.website} onChange={(value) => set("website", value)} />
            <Field label="Listing URL" value={draft.listingUrl} onChange={(value) => set("listingUrl", value)} />
            <Field label="Seller profile" value={draft.sellerUrl} onChange={(value) => set("sellerUrl", value)} />
            <label className="rec-field">
              Status
              <select className="az-select" value={draft.status} onChange={(event) => set("status", event.target.value)}>
                {STAGES.map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </select>
            </label>
            <div className="rec-grid">
              <label className="rec-field">
                Priority
                <select className="az-select" value={draft.priority} onChange={(event) => set("priority", event.target.value as Priority)}>
                  {["Low", "Medium", "High", "Critical"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <Field label="Source" value={draft.source} onChange={(value) => set("source", value)} />
            </div>
            <Field label="Owner" value={draft.owner} onChange={(value) => set("owner", value)} />
            <Field label="Next action" value={draft.nextAction} onChange={(value) => set("nextAction", value)} />
            <label className="rec-field">
              Notes
              <textarea className="az-area" value={draft.notes} onChange={(event) => set("notes", event.target.value)} />
            </label>
            <div className="rec-save">
              <button className="az-btn pri flex-1" type="submit" disabled={!dirty}>
                {dirty ? "Save" : "Saved"}
              </button>
              {live.archivedAt ? (
                <>
                  <button className="az-btn" type="button" onClick={restore}>
                    Restore
                  </button>
                  <button className="az-btn danger" type="button" onClick={remove}>
                    Delete
                  </button>
                </>
              ) : (
                <button className="az-btn" type="button" onClick={archive}>
                  Archive
                </button>
              )}
            </div>
          </form>
        ) : null}

        {tab === "activity" ? (
          <section className="rec-list">
            {timeline.length === 0 ? <p className="rec-empty">No activity on this prospect yet.</p> : null}
            {timeline.map((item) => (
              <div key={item.id} className="rec-row">
                <b>{item.kind.replaceAll("_", " ")}</b>
                <p>{item.detail}</p>
                <span>{formatWhen(item.at)}</span>
              </div>
            ))}
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="rec-field">
      {label}
      <input className="az-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { STAGES } from "@/lib/stages";
import { formatWhen, money, nowIso, phonePretty } from "@/lib/format";
import { cascadeDeleteLead } from "@/lib/crm";
import { archiveLead, contactTimeline, findDuplicateLeads, relatedFor, restoreLead } from "@/lib/contacts";
import { companyName, generateFollowUp, generateOpeningMessage, leadLocation, shipmentMargin, summarizeProspect, CLIENT_KINDS } from "@/lib/freight";
import { recommendEquipment } from "@/lib/equipment";
import type { Lead, Priority, ShipmentStatus } from "@/lib/types";

type Tab = "intel" | "record" | "activity";

const TABS: { id: Tab; label: string }[] = [
  { id: "intel", label: "Intelligence" },
  { id: "record", label: "Record" },
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

  useEffect(() => {
    setDraft(draftFrom(live));
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
      leads: prev.leads.map((item) =>
        item.id === live.id
          ? {
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
              label: draft.label === "Unlabeled" ? "" : draft.label,
              updatedAt: stamp,
            }
          : item,
      ),
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
    const stamp = nowIso();
    setWorkspace((prev) => ({
      ...prev,
      callLogs: [
        { id: `call-${Date.now()}`, leadId: live.id, outcome: callOutcome, duration: 0, notes: callNote, at: stamp },
        ...(prev.callLogs || []),
      ],
      leads: prev.leads.map((item) => (item.id === live.id ? { ...item, lastContactAt: stamp, attempts: (item.attempts || 0) + 1, updatedAt: stamp } : item)),
      updatedAt: stamp,
    }));
    log("lead", live.id, "call", `Call logged: ${callOutcome}${callNote ? ` · ${callNote}` : ""}`);
    setCallNote("");
  }

  function addQuote() {
    const stamp = nowIso();
    setWorkspace((prev) => ({
      ...prev,
      quotes: [
        {
          id: `qt-${Date.now()}`,
          leadId: live.id,
          origin: live.origin || live.city,
          destination: live.destination || "",
          commodity: live.listingTitle || live.equipmentType || "",
          equipmentType: live.freightType || "",
          customerRate: 0,
          carrierCost: 0,
          status: "requested",
          notes: "",
          createdAt: stamp,
        },
        ...(prev.quotes || []),
      ],
      leads: prev.leads.map((item) => (item.id === live.id ? { ...item, status: "Quote Requested", updatedAt: stamp } : item)),
      opportunities: prev.opportunities.map((item) =>
        item.leadId === live.id
          ? { ...item, stage: "Quote Requested", stageEnteredAt: stamp, updatedAt: stamp, history: [{ from: item.stage, to: "Quote Requested", at: stamp, source: "profile" }, ...item.history] }
          : item,
      ),
      updatedAt: stamp,
    }));
    log("lead", live.id, "quote_requested", "Quote request created");
  }

  function addShipment(status: ShipmentStatus = "Quote") {
    const stamp = nowIso();
    setWorkspace((prev) => ({
      ...prev,
      shipments: [
        {
          id: `shp-${Date.now()}`,
          leadId: live.id,
          customer: companyName(live),
          contact: live.name,
          origin: live.origin || leadLocation(live),
          destination: live.destination || "",
          pickupDate: "",
          deliveryDate: "",
          commodity: live.listingTitle || live.equipmentType || "",
          weight: live.weight || "",
          dimensions: live.dimensions || "",
          equipmentType: live.freightType || "",
          carrier: "",
          carrierRate: 0,
          customerRate: 0,
          status,
          reference: "",
          notes: "",
          createdAt: stamp,
          updatedAt: stamp,
        },
        ...(prev.shipments || []),
      ],
      updatedAt: stamp,
    }));
    log("lead", live.id, "shipment_created", `Shipment ${status}`);
    router.push("/shipments");
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
          <button className="az-btn pri sm" type="button" onClick={() => { setSelectedLeadId(live.id); router.push("/outreach"); }}>
            Outreach
          </button>
          {live.listingUrl ? (
            <a className="az-btn sm" href={live.listingUrl} target="_blank" rel="noreferrer">
              Open listing
            </a>
          ) : null}
          {live.phone ? (
            <a className="az-btn sm" href={`tel:${live.phone}`}>
              Call {phonePretty(live.phone)}
            </a>
          ) : null}
          <button className="az-btn sm" type="button" onClick={addQuote}>
            Quote request
          </button>
        </div>

        <div className="rec-tabs" role="tablist">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>
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
                <span>Trailer guess</span>
                <b>{live.trailerHint || `${fit.trailerName} · ${fit.loadClass}`}</b>
              </div>
              <div>
                <span>Recurring</span>
                <b>{live.recurringPotential || "Low"}</b>
              </div>
              <div>
                <span>Lane</span>
                <b>
                  {live.origin || live.city || "—"} → {live.destination || "Unknown"}
                </b>
              </div>
            </div>
            <p className="cd-mono">{fit.why}</p>
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
            <h3>Quotes / shipments</h3>
            {(related.quotes || []).map((item) => (
              <div key={item.id} className="rec-row">
                <b>
                  {item.origin} → {item.destination}
                </b>
                <p>
                  Customer {money(item.customerRate)} · carrier {money(item.carrierCost)} · margin {money(shipmentMargin(item.customerRate, item.carrierCost))}
                </p>
              </div>
            ))}
            {(related.shipments || []).map((item) => (
              <div key={item.id} className="rec-row">
                <b>{item.status}</b>
                <p>
                  {item.origin} → {item.destination} · {item.commodity}
                </p>
              </div>
            ))}
            <button className="az-btn sm" type="button" onClick={() => addShipment("Quote")}>
              Create shipment
            </button>
          </section>
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
              <Field label="Category" value={draft.category} onChange={(value) => set("category", value)} />
              <Field label="Equipment" value={draft.equipmentType} onChange={(value) => set("equipmentType", value)} />
            </div>
            <div className="rec-grid">
              <Field label="Origin" value={draft.origin} onChange={(value) => set("origin", value)} />
              <Field label="Destination" value={draft.destination} onChange={(value) => set("destination", value)} />
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { derive } from "@/lib/derive";
import { deskCallBook, todayHunt } from "@/lib/desk";
import { bookedMargin, deskAttention, liveLoadSnapshot } from "@/lib/ops";
import { browserTelephony } from "@/lib/telephony";
import { inCallingWindow } from "@/lib/us-time";
import { settingsWithDefaults } from "@/lib/types";
import { huntQueue } from "@/lib/hunt";
import { applySpecsToLead, recommendEquipment, specsFromLead } from "@/lib/equipment";
import { companyName, finishConnectedCall, leadLocation, outreachQueue, parseMeasure, suggestClientKind } from "@/lib/freight";
import { groupByMetro, huntPlacesFromBook, metroOf } from "@/lib/metro";
import { bookerOf, contactsForLead, skipQuote, unfinishedTalked, upsertBooker } from "@/lib/people";
import { firstCall, labelObviousYards, obviousYardCount, wrapCall, type CallOutcome } from "@/lib/prospect";
import { HuntDance } from "./hunt-dance";
import { callReason, todayStrip, weekCounts } from "@/lib/desk-rules";
import { deskFlow } from "@/lib/flow";
import { workPath } from "@/lib/nav";
import { messagesSentOnDay } from "@/lib/pacing";
import { money, nowIso, phonePretty, relativeDue } from "@/lib/format";
import type { Lead } from "@/lib/types";

export function TodayView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const hunt = useMemo(() => todayHunt(new Date(), workspace), [workspace]);
  const queue = useMemo(() => huntQueue(new Date(), 12, huntPlacesFromBook(workspace)), [workspace]);
  const attention = useMemo(() => deskAttention(workspace), [workspace]);
  const loads = useMemo(() => liveLoadSnapshot(workspace), [workspace]);
  const books = useMemo(() => bookedMargin(workspace), [workspace]);
  const callBook = useMemo(() => deskCallBook(workspace, 80), [workspace]);
  const [metroId, setMetroId] = useState("all");
  const metroGroups = useMemo(() => groupByMetro(callBook), [callBook]);
  const filteredBook = useMemo(
    () => (metroId === "all" ? callBook : callBook.filter((lead) => metroOf(lead)?.id === metroId)),
    [callBook, metroId],
  );
  const [bookmarklet, setBookmarklet] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [copyError, setCopyError] = useState("");
  const live = useMemo(() => workspace.leads.filter((lead) => !lead.archivedAt), [workspace.leads]);
  const unlabeledAll = useMemo(() => live.filter((lead) => !lead.label), [live]);
  const unlabeled = unlabeledAll.slice(0, 6);
  const obvious = useMemo(() => obviousYardCount(live), [live]);
  const [booker, setBooker] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
  const [wrapNote, setWrapNote] = useState("");
  const [dest, setDest] = useState("");
  const [specL, setSpecL] = useState("");
  const [specW, setSpecW] = useState("");
  const [specH, setSpecH] = useState("");
  const [specLb, setSpecLb] = useState("");
  const [specMsg, setSpecMsg] = useState("");
  const [lastWrappedId, setLastWrappedId] = useState("");
  const [lastOutcome, setLastOutcome] = useState<CallOutcome | "">("");
  const wrappedLead = lastWrappedId ? live.find((lead) => lead.id === lastWrappedId) || null : null;
  const nextCall = wrappedLead || filteredBook[0] || null;
  const nextFive = filteredBook.filter((lead) => lead.id !== lastWrappedId).slice(0, 5);
  const prefs = settingsWithDefaults(workspace.settings);
  const hours = nextCall ? inCallingWindow(nextCall.state, prefs.dialWindowStart, prefs.dialWindowEnd) : null;
  const stillCalling = callBook.length > 0 || Boolean(wrappedLead);
  const toMessage = useMemo(() => outreachQueue(live).slice(0, 6), [live]);
  const followUps = useMemo(
    () => [...metrics.overdueCallbacks, ...metrics.dueCallbacks.filter((item) => !metrics.overdueCallbacks.includes(item))].slice(0, 6),
    [metrics.dueCallbacks, metrics.overdueCallbacks],
  );
  const hotYards = useMemo(
    () =>
      live
        .filter((lead) => (lead.shipperRole === "Yard" || lead.label === "Dealer") && (lead.freightScore || 0) >= 70)
        .slice(0, 6),
    [live],
  );
  const sentToday = useMemo(() => messagesSentOnDay(workspace.kpiEvents || []), [workspace.kpiEvents]);
  const nextScript = nextCall ? firstCall(nextCall, sentToday) : null;
  const pendingTalked = useMemo(() => unfinishedTalked(workspace), [workspace]);
  const wrapContacts = nextCall ? contactsForLead(workspace, nextCall.id) : [];
  const wrapBooker = nextCall ? bookerOf(workspace, nextCall) : null;
  const strip = useMemo(() => todayStrip(workspace), [workspace]);
  const week = useMemo(() => weekCounts(workspace), [workspace]);
  const counts = useMemo(() => deskFlow(workspace, hunt), [workspace, hunt]);
  const wrapFit = recommendEquipment({
    text: nextCall?.equipmentType || nextCall?.listingTitle || "",
    lengthFt: parseMeasure(specL),
    widthFt: parseMeasure(specW),
    heightFt: parseMeasure(specH),
    weightLbs: parseMeasure(specLb),
  });

  useEffect(() => {
    fetch("/api/ai/status")
      .then((res) => res.json())
      .then((json) => setBookmarklet(String(json.bookmarklet || "")))
      .catch(() => setBookmarklet(""));
  }, []);

  async function copyBookmarklet() {
    if (!bookmarklet) {
      router.push("/settings");
      return;
    }
    try {
      await navigator.clipboard.writeText(bookmarklet);
    } catch {
      router.push("/settings");
    }
  }

  function complete(id: string) {
    setWorkspace((prev) => ({
      ...prev,
      callbacks: prev.callbacks.map((item) => (item.id === id ? { ...item, status: "completed", completedAt: nowIso() } : item)),
      updatedAt: nowIso(),
    }));
    log("callback", id, "completed", "Completed from Desk");
  }

  function openLead(id: string | null, href: string) {
    if (id) setSelectedLeadId(id);
    router.push(href);
  }

  async function copyOpener(lead: Lead) {
    const text = firstCall(lead, sentToday).opener;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(lead.id);
      setCopyError("");
      log("lead", lead.id, "copied_opener", "Copied first-call opener from Desk");
    } catch {
      setCopiedId("");
      setCopyError("Clipboard blocked. Select the opener and copy it.");
    }
  }

  function fillWrap(lead: Lead) {
    const specs = specsFromLead(lead);
    const person = bookerOf(workspace, lead);
    setBooker(person?.name || lead.booker || "");
    setBookerPhone(person?.phone || lead.bookerPhone || "");
    setDest(lead.destination || "");
    setSpecL(specs.lengthFt != null ? String(specs.lengthFt) : "");
    setSpecW(specs.widthFt != null ? String(specs.widthFt) : "");
    setSpecH(specs.heightFt != null ? String(specs.heightFt) : "");
    setSpecLb(specs.weightLbs != null ? String(specs.weightLbs) : "");
    setSpecMsg(lead.dimensions || lead.weight ? `On file: ${lead.dimensions || "—"} · ${lead.weight ? `${lead.weight} lb` : "no weight"}` : "");
    setWrapNote("");
  }

  function noteCall(lead: Lead, outcome: CallOutcome) {
    const sameHero = lead.id === nextCall?.id && !lastOutcome;
    setWorkspace((prev) =>
      wrapCall(prev, lead.id, outcome, {
        booker: sameHero ? booker.trim() : lead.booker,
        bookerPhone: sameHero ? bookerPhone.trim() : lead.bookerPhone,
        notes: sameHero ? wrapNote.trim() : "",
      }),
    );
    log(
      "lead",
      lead.id,
      "call_attempt",
      outcome === "talked" ? "Talked from Desk" : outcome === "voicemail" ? "Voicemail from Desk" : outcome === "wrong_number" ? "Wrong number from Desk" : "No pickup from Desk",
    );
    if (outcome === "no_pickup" || outcome === "voicemail") void copyOpener(lead);
    fillWrap({
      ...lead,
      booker: sameHero ? booker.trim() || lead.booker : lead.booker,
      bookerPhone: sameHero ? bookerPhone.trim() || lead.bookerPhone : lead.bookerPhone,
    });
    setLastWrappedId(lead.id);
    setLastOutcome(outcome);
    setSelectedLeadId(lead.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    if (lastWrappedId || !pendingTalked) return;
    const lead = live.find((item) => item.id === pendingTalked.leadId);
    if (!lead) return;
    fillWrap(lead);
    setLastWrappedId(lead.id);
    setLastOutcome("talked");
    setSelectedLeadId(lead.id);
  }, [pendingTalked?.leadId, lastWrappedId, live]);

  function skipWrapQuote(lead: Lead) {
    setWorkspace((prev) => skipQuote(prev, lead.id));
    log("lead", lead.id, "quote_skipped", "Skipped blank quote from Desk");
    dismissWrap();
  }

  function dismissWrap() {
    setLastWrappedId("");
    setLastOutcome("");
    setWrapNote("");
    setDest("");
    setSpecL("");
    setSpecW("");
    setSpecH("");
    setSpecLb("");
    setSpecMsg("");
    setBooker("");
    setBookerPhone("");
  }

  function saveSpecsOnWrap(lead: Lead) {
    const result = applySpecsToLead(lead, {
      unit: lead.equipmentType || lead.listingTitle || "",
      lengthFt: parseMeasure(specL),
      widthFt: parseMeasure(specW),
      heightFt: parseMeasure(specH),
      weightLbs: parseMeasure(specLb),
    });
    if (!result.saved) {
      setSpecMsg(result.reason);
      return;
    }
    const stamp = result.lead.updatedAt;
    setWorkspace((prev) => {
      const withSpecs = {
        ...prev,
        leads: prev.leads.map((item) =>
          item.id === lead.id
            ? { ...result.lead, destination: dest.trim() || result.lead.destination, booker: booker.trim() || result.lead.booker, bookerPhone: bookerPhone.trim() || result.lead.bookerPhone }
            : item,
        ),
        updatedAt: stamp,
      };
      return upsertBooker(withSpecs, lead.id, { name: booker.trim(), phone: bookerPhone.trim() }).workspace;
    });
    log("lead", lead.id, "specs_saved", result.lead.dimensions || "");
    setSpecMsg(`Saved on ${lead.name}. ${result.lead.trailerHint}`);
  }

  function openBlankQuote(lead: Lead) {
    const result = finishConnectedCall(workspace, lead.id, {
      booker: booker.trim(),
      bookerPhone: bookerPhone.trim(),
      destination: dest.trim(),
      lengthFt: parseMeasure(specL),
      widthFt: parseMeasure(specW),
      heightFt: parseMeasure(specH),
      weightLbs: parseMeasure(specLb),
      unit: lead.equipmentType || lead.listingTitle || "",
    });
    if (!result.ok) {
      setSpecMsg(result.error);
      return;
    }
    setWorkspace(result.workspace);
    setSelectedLeadId(lead.id);
    log("shipment", result.shipment.id, result.created ? "created" : "updated", `Blank quote from Desk for ${lead.name}`);
    dismissWrap();
    router.push(`/shipments?id=${encodeURIComponent(result.shipment.id)}`);
  }

  function labelObvious() {
    const stamp = nowIso();
    setWorkspace((prev) => ({ ...prev, leads: labelObviousYards(prev.leads, stamp), updatedAt: stamp }));
    log("lead", "book", "labeled", "Labeled obvious yards from Desk");
  }

  function applySuggestedLabel(lead: Lead) {
    const kind = suggestClientKind({ sellerName: lead.name, title: lead.listingTitle, source: lead.source, website: lead.website });
    if (!kind) return;
    const stamp = nowIso();
    setWorkspace((prev) => ({
      ...prev,
      leads: prev.leads.map((item) =>
        item.id === lead.id
          ? {
              ...item,
              label: kind,
              nextAction: item.nextAction.startsWith("Label") ? "Call the published number" : item.nextAction,
              updatedAt: stamp,
            }
          : item,
      ),
      updatedAt: stamp,
    }));
    log("lead", lead.id, "labeled", `Labeled ${kind} from Desk`);
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Reading workspace…</div>;

  const deskDay = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="cd-page fill">
      <div className="home-desk desk-home">
        <header className="home-desk-head">
          <div>
            <div className="home-kicker">{deskDay}</div>
            <h1>Dashboard</h1>
            <p>
              {pendingTalked
                ? `Stay with ${live.find((item) => item.id === pendingTalked.leadId)?.name || "this yard"}. Quote still blank.`
                : callBook.length
                  ? `${callBook.length} untried · published phone.`
                  : live.length
                    ? `${hunt.weekday} in ${hunt.place}. Hunt, paste, then the floor fills.`
                    : `${hunt.weekday} · ${hunt.play.title} in ${hunt.place}. Open a page and come back.`}
            </p>
          </div>
          <div className="home-stats">
            <button type="button" onClick={() => router.push(workPath())}>
              <b>{strip.ready}</b>
              <span>Ready to call</span>
            </button>
            <button type="button" onClick={() => router.push(workPath())}>
              <b>{strip.calledToday}</b>
              <span>Called today</span>
            </button>
            <button type="button" onClick={() => router.push("/people")}>
              <b>{strip.namedBooker}</b>
              <span>Named a booker</span>
            </button>
            <button type="button" onClick={() => router.push("/shipments")}>
              <b>{strip.quoteRequested}</b>
              <span>Quote requested</span>
            </button>
            <button type="button" onClick={() => router.push("/shipments")}>
              <b>{strip.loadLive}</b>
              <span>Load live</span>
            </button>
          </div>
        </header>

        <div className="desk-floor">
        <dl className="count-strip">
          {counts.steps.map((step) => (
            <div key={step.id}>
              <dt>{step.label}</dt>
              <dd>{step.count}</dd>
            </div>
          ))}
        </dl>
        <section className="az-panel freight-panel desk-next-calls">
          <header>
            <div>
              <div className="home-kicker">Next 3 calls</div>
              <h3>Untried first</h3>
            </div>
          </header>
          {strip.nextCalls.length === 0 ? (
            <p className="cd-mono">No published phones waiting. Hunt a metro and paste a page.</p>
          ) : (
            <div className="next-call-list">
              {strip.nextCalls.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  className="next-call-row"
                  onClick={() => {
                    setSelectedLeadId(lead.id);
                    router.push(workPath(lead.id));
                  }}
                >
                  <div>
                    <b>{lead.name}</b>
                    <span>{[lead.city, lead.state].filter(Boolean).join(", ") || "Texas"} · {phonePretty(lead.phone)}</span>
                  </div>
                  <em>{callReason(lead)}</em>
                </button>
              ))}
            </div>
          )}
          <p className="week-counts">
            This week · {week.hunts} hunts · {week.pastes} pastes · {week.voicemails} voicemails · {week.talks} talks
          </p>
        </section>

        {nextCall && nextScript ? (
          <section className={`az-panel freight-panel desk-next${wrappedLead && lastOutcome ? " desk-wrap" : ""}`}>
            <header>
              <div>
                <div className="home-kicker">
                  {wrappedLead && lastOutcome === "talked"
                    ? "Stay on this call"
                    : wrappedLead && lastOutcome
                      ? lastOutcome === "wrong_number"
                        ? "Wrong number"
                        : lastOutcome === "voicemail"
                          ? "Voicemail logged"
                          : "No pickup logged"
                      : "Next call"}
                </div>
                <h3>{nextCall.name}</h3>
              </div>
              <span className="cd-mono">
                Yard · {nextCall.label || "Unlabeled"} · {leadLocation(nextCall) || hunt.place} · {phonePretty(nextCall.phone)}
                {wrapBooker ? ` · Booker ${wrapBooker.name}` : ""}
              </span>
            </header>
            {wrappedLead && lastOutcome === "talked" ? (
              <>
                <p className="desk-ask">
                  This yard stays here until you save a $0 quote. {nextCall.name} is the customer. The booker is a contact on that yard.
                </p>
                <div className="desk-booker">
                  <label className="rec-field">
                    Who books freight
                    <input className="az-input" value={booker} onChange={(event) => setBooker(event.target.value)} placeholder="Name they gave you" />
                  </label>
                  <label className="rec-field">
                    Direct line
                    <input className="az-input" value={bookerPhone} onChange={(event) => setBookerPhone(event.target.value)} placeholder="Only if they gave it" />
                  </label>
                  <label className="rec-field">
                    Destination
                    <input className="az-input" value={dest} onChange={(event) => setDest(event.target.value)} placeholder="City, ST they named" />
                  </label>
                </div>
                {wrapContacts.length ? (
                  <p className="cd-mono">
                    Contacts on this yard: {wrapContacts.map((item) => [item.name, item.role, item.phone].filter(Boolean).join(" · ")).join("; ")}
                  </p>
                ) : null}
                <div className="desk-specs">
                  <div className="home-kicker">Measured specs</div>
                  <div className="desk-specs-grid">
                    <label className="rec-field">
                      L ft
                      <input className="az-input" inputMode="decimal" value={specL} onChange={(event) => setSpecL(event.target.value)} />
                    </label>
                    <label className="rec-field">
                      W ft
                      <input className="az-input" inputMode="decimal" value={specW} onChange={(event) => setSpecW(event.target.value)} />
                    </label>
                    <label className="rec-field">
                      H ft
                      <input className="az-input" inputMode="decimal" value={specH} onChange={(event) => setSpecH(event.target.value)} />
                    </label>
                    <label className="rec-field">
                      lb
                      <input className="az-input" inputMode="decimal" value={specLb} onChange={(event) => setSpecLb(event.target.value)} />
                    </label>
                  </div>
                  <p className="cd-mono">
                    {parseMeasure(specL) != null || parseMeasure(specLb) != null
                      ? `${wrapFit.trailerName} · ${wrapFit.loadClass}. ${wrapFit.why}`
                      : "Type the numbers they told you. Catalog nicknames are not specs."}
                  </p>
                  {specMsg ? <p className="cd-mono">{specMsg}</p> : null}
                </div>
                <div className="desk-next-actions">
                  <button className="az-btn pri" type="button" onClick={() => openBlankQuote(nextCall)}>
                    Blank quote — rates $0
                  </button>
                  <button className="az-btn" type="button" onClick={() => saveSpecsOnWrap(nextCall)}>
                    Save specs
                  </button>
                  <button className="az-btn" type="button" onClick={() => openLead(nextCall.id, workPath(nextCall.id))}>
                    Work
                  </button>
                  <button className="az-btn" type="button" onClick={() => skipWrapQuote(nextCall)}>
                    Skip quote — next call
                  </button>
                </div>
              </>
            ) : wrappedLead && lastOutcome ? (
              <>
                <p className="desk-ask">
                  {lastOutcome === "wrong_number"
                    ? "Wrong number. Hunt another published phone or skip this yard."
                    : "Follow-up is set for tomorrow. Copy the opener and send it yourself."}
                </p>
                {copyError ? <p className="rec-warn">{copyError}</p> : null}
                <blockquote className="desk-opener">{nextScript.opener}</blockquote>
                <div className="desk-next-actions">
                  <button className="az-btn pri" type="button" onClick={() => void copyOpener(nextCall)}>
                    {copiedId === nextCall.id ? "Copied" : "Copy opener"}
                  </button>
                  <button className="az-btn" type="button" onClick={() => openLead(nextCall.id, workPath(nextCall.id))}>
                    Open in Work
                  </button>
                  <button className="az-btn pri" type="button" onClick={dismissWrap}>
                    Next untried call
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="desk-ask">{nextScript.ask}</p>
                {hours ? <p className={hours.ok ? "desk-why" : "rec-warn"}>{hours.label}. {hours.why}</p> : null}
                <blockquote className="desk-opener">{nextScript.opener}</blockquote>
                {copyError ? <p className="rec-warn">{copyError}</p> : null}
                <div className="desk-booker">
                  <label className="rec-field">
                    Who books freight
                    <input className="az-input" value={booker} onChange={(event) => setBooker(event.target.value)} placeholder="Name they gave you" />
                  </label>
                  <label className="rec-field">
                    Direct line (if they gave it)
                    <input className="az-input" value={bookerPhone} onChange={(event) => setBookerPhone(event.target.value)} placeholder="Only if published or they told you" />
                  </label>
                  <label className="rec-field">
                    Wrap note
                    <input className="az-input" value={wrapNote} onChange={(event) => setWrapNote(event.target.value)} placeholder="Saved on the call event" />
                  </label>
                </div>
                <div className="desk-next-actions">
                  <button className="az-btn gold" type="button" onClick={() => browserTelephony().startCall(nextCall.phone)}>
                    Call {phonePretty(nextCall.phone)}
                  </button>
                  <button className="az-btn pri" type="button" onClick={() => noteCall(nextCall, "talked")}>
                    Talked{booker.trim() ? ` — ${booker.trim()}` : ""}
                  </button>
                  <button className="az-btn" type="button" onClick={() => noteCall(nextCall, "no_pickup")}>
                    No pickup
                  </button>
                  <button className="az-btn" type="button" onClick={() => noteCall(nextCall, "voicemail")}>
                    Voicemail
                  </button>
                  <button className="az-btn" type="button" onClick={() => noteCall(nextCall, "wrong_number")}>
                    Wrong number
                  </button>
                  <button className="az-btn" type="button" onClick={() => void copyOpener(nextCall)}>
                    {copiedId === nextCall.id ? "Copied" : "Copy opener"}
                  </button>
                  {!nextCall.label && suggestClientKind({ sellerName: nextCall.name, title: nextCall.listingTitle, source: nextCall.source, website: nextCall.website }) ? (
                    <button className="az-btn" type="button" onClick={() => applySuggestedLabel(nextCall)}>
                      Label {suggestClientKind({ sellerName: nextCall.name, title: nextCall.listingTitle, source: nextCall.source, website: nextCall.website })}
                    </button>
                  ) : null}
                  <button className="az-btn" type="button" onClick={() => openLead(nextCall.id, workPath(nextCall.id))}>
                    Open in Work
                  </button>
                </div>
              </>
            )}
            {nextFive.length > 0 ? (
              <ol className="desk-next-strip">
                {nextFive.map((lead, index) => {
                  const suggested = lead.label ? "" : suggestClientKind({ sellerName: lead.name, title: lead.listingTitle, source: lead.source, website: lead.website });
                  return (
                  <li key={lead.id}>
                    <button type="button" onClick={() => openLead(lead.id, workPath(lead.id))}>
                      <b>
                        {index + 1}. {lead.name}
                      </b>
                      <span>
                        {lead.label || suggested || "Unlabeled"} · {leadLocation(lead) || metroOf(lead)?.label || "—"}
                        {(lead.attempts || 0) > 0 ? ` · tried ${lead.attempts}` : ""}
                      </span>
                    </button>
                    <button className="az-btn sm" type="button" onClick={() => browserTelephony().startCall(lead.phone)}>
                      {phonePretty(lead.phone)}
                    </button>
                  </li>
                  );
                })}
              </ol>
            ) : null}
          </section>
        ) : null}
        </div>

        {attention.length ? (
          <section className="az-panel freight-panel desk-attention">
            <header>
              <div>
                <div className="home-kicker">Needs attention</div>
                <h3>Waiting</h3>
              </div>
              <span className="cd-mono">
                Booked margin {books.margin ? money(books.margin) : "—"} · {books.quoted} open quotes
              </span>
            </header>
            <table className="az-table min-w-0">
              <tbody>
                {attention.map((item) => (
                  <tr key={item.id} onClick={() => router.push(item.href)}>
                    <td>
                      <b>{item.title}</b>
                    </td>
                    <td>{item.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {loads.length ? (
          <section className="az-panel freight-panel desk-loads">
            <header>
              <div>
                <div className="home-kicker">Active loads</div>
                <h3>Active loads</h3>
              </div>
              <button className="az-btn sm" type="button" onClick={() => router.push("/shipments")}>
                Open shipments
              </button>
            </header>
            <div className="az-panel overflow-auto min-h-0 crm-table-wrap">
              <table className="az-table min-w-[980px]">
                <thead>
                  <tr>
                    <th>Load</th>
                    <th>Customer</th>
                    <th>Lane</th>
                    <th>Equipment</th>
                    <th>Status</th>
                    <th>Margin</th>
                    <th>Last check</th>
                  </tr>
                </thead>
                <tbody>
                  {loads.map((item) => (
                    <tr key={item.id} onClick={() => router.push(`/shipments?id=${encodeURIComponent(item.id)}`)}>
                      <td>{item.loadNumber || "—"}</td>
                      <td>{item.customer}</td>
                      <td>
                        {item.origin || "—"} → {item.destination || "—"}
                      </td>
                      <td>{item.equipmentType || "—"}</td>
                      <td>{item.status}</td>
                      <td className="az-num">{item.customerRate || item.carrierRate ? money(item.margin) : "—"}</td>
                      <td>{item.lastCheck}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {callBook.length ? (
          <section className="az-panel freight-panel desk-call-book">
            <header>
              <div>
                <div className="home-kicker">Call book · {hunt.place}</div>
                <h3>Untried first</h3>
              </div>
              <div className="freight-row-actions">
                {obvious ? (
                  <button className="az-btn pri sm" type="button" onClick={labelObvious}>
                    Label {obvious} yards
                  </button>
                ) : null}
                <button className="az-btn sm" type="button" onClick={() => router.push("/people")}>
                  All {live.length}
                </button>
              </div>
            </header>
            <div className="metro-chips">
              <button type="button" className={`az-btn sm ${metroId === "all" ? "pri" : ""}`} onClick={() => setMetroId("all")}>
                All {callBook.length}
              </button>
              {metroGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={`az-btn sm ${metroId === group.id ? "pri" : ""}`}
                  onClick={() => setMetroId(group.id)}
                >
                  {group.label} {group.leads.length}
                </button>
              ))}
            </div>
            {(metroId === "all" ? metroGroups : [{ id: metroId, label: metroGroups.find((item) => item.id === metroId)?.label || "Metro", hunt: "", leads: filteredBook }]).map((group) => (
              <div key={group.id} className="desk-call-group">
                {metroId === "all" ? <h4>{group.label}</h4> : null}
                <div className="desk-call-grid">
                  {group.leads.map((lead) => {
                    const script = firstCall(lead, sentToday);
                    const suggested = lead.label ? "" : suggestClientKind({ sellerName: lead.name, title: lead.listingTitle, source: lead.source, website: lead.website });
                    return (
                      <div key={lead.id} className="desk-call-row">
                        <button type="button" className="desk-call-who" onClick={() => openLead(lead.id, workPath(lead.id))}>
                          <b>{lead.name}</b>
                          <span>
                            {lead.label || suggested || "Unlabeled"} · {leadLocation(lead) || metroOf(lead)?.label || "—"}
                            {(lead.attempts || 0) > 0 ? ` · tried ${lead.attempts}` : " · untried"}
                          </span>
                          <em>{script.ask}</em>
                        </button>
                        <div className="desk-call-actions">
                          <button className="az-btn pri sm" type="button" onClick={() => browserTelephony().startCall(lead.phone)}>
                            {phonePretty(lead.phone)}
                          </button>
                          <div className="desk-wrap-disp">
                            <button type="button" onClick={() => noteCall(lead, "talked")}>
                              Talked
                            </button>
                            <button type="button" onClick={() => noteCall(lead, "no_pickup")}>
                              Miss
                            </button>
                            <button type="button" onClick={() => noteCall(lead, "voicemail")}>
                              VM
                            </button>
                            <button type="button" onClick={() => noteCall(lead, "wrong_number")}>
                              Wrong
                            </button>
                          </div>
                          <button className="az-btn sm" type="button" onClick={() => void copyOpener(lead)}>
                            {copiedId === lead.id ? "Copied" : "Copy"}
                          </button>
                          {suggested ? (
                            <button className="az-btn sm" type="button" onClick={() => applySuggestedLabel(lead)}>
                              Label {suggested}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {stillCalling ? <HuntDance hunt={hunt} /> : null}

        {!stillCalling ? (
          <>
          <section className="desk-today">
          <div className="desk-today-copy">
            <div className="home-kicker">{hunt.weekday} hunt</div>
            <h2>{hunt.play.title}</h2>
            <p>{hunt.doThis}</p>
            <div className="empty-desk-actions">
              <button className="az-btn gold" type="button" onClick={() => router.push(hunt.href)}>
                Hunt {hunt.query} · {hunt.place}
              </button>
              <button className="az-btn" type="button" onClick={() => void copyBookmarklet()}>
                {bookmarklet ? "Copy bookmarklet" : "Get bookmarklet"}
              </button>
              <button className="az-btn" type="button" onClick={() => router.push("/discover?tab=paste")}>
                Paste a page
              </button>
            </div>
          </div>
          <div className="desk-today-links">
            <div className="home-kicker">Open, then paste</div>
            {hunt.links.map((item) => (
              <a key={item.id} className="desk-open-row" href={item.url} target="_blank" rel="noreferrer">
                <span>{item.name}</span>
                <em>Open</em>
              </a>
            ))}
            <button className="desk-open-row" type="button" onClick={() => router.push("/discover?tab=paste")}>
              <span>Then paste the page you copied</span>
              <em>Paste</em>
            </button>
          </div>
        </section>

        <section className="az-panel freight-panel desk-queue">
          <header>
            <div>
              <div className="home-kicker">Keep hunting</div>
              <h3>Today’s searches in {hunt.place}</h3>
            </div>
            <button className="az-btn sm" type="button" onClick={() => router.push("/discover")}>
              All plays
            </button>
          </header>
          <div className="desk-queue-grid">
            {queue.map((item) => (
              <a key={item.id} className="desk-open-row desk-queue-row" href={item.url} target="_blank" rel="noreferrer">
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.playTitle} · {item.query} · {item.place}
                  </small>
                </span>
                <em>Open</em>
              </a>
            ))}
            <button className="desk-open-row" type="button" onClick={() => router.push("/discover?tab=paste")}>
              <span>Paste the page you copied</span>
              <em>Paste</em>
            </button>
          </div>
        </section>

          </>
        ) : null}

        {live.length > 0 ? (
          <>
            <div className="desk-work-grid">
              {!stillCalling ? (
              <>
              <section className="az-panel freight-panel">
                <header>
                  <h3>Needs a label</h3>
                  <button className="az-btn sm" type="button" onClick={() => router.push("/people?filter=unlabeled")}>
                    All
                  </button>
                </header>
                {unlabeled.length === 0 ? <p className="rec-empty">Every client is labeled.</p> : null}
                {unlabeled.map((lead) => {
                  const suggested = suggestClientKind({ sellerName: lead.name, title: lead.listingTitle, source: lead.source, website: lead.website });
                  return (
                  <div key={lead.id} className="work-row">
                    <button type="button" className="desk-call-who" onClick={() => openLead(lead.id, workPath(lead.id))}>
                      <b>{lead.name}</b>
                      <div className="cd-mono">
                        {lead.source} · {leadLocation(lead) || "—"}
                      </div>
                    </button>
                    {suggested ? (
                      <button className="az-btn sm" type="button" onClick={() => applySuggestedLabel(lead)}>
                        Label {suggested}
                      </button>
                    ) : (
                      <span className="az-chip">Unlabeled</span>
                    )}
                  </div>
                  );
                })}
              </section>

              <section className="az-panel freight-panel">
                <header>
                  <h3>Message these</h3>
                  <button className="az-btn sm" type="button" onClick={() => router.push(workPath())}>
                    Work
                  </button>
                </header>
                {toMessage.length === 0 ? <p className="rec-empty">Queue is clear.</p> : null}
                {toMessage.map((lead) => (
                  <button key={lead.id} type="button" className="work-row text-left" onClick={() => openLead(lead.id, workPath(lead.id))}>
                    <div>
                      <b>{lead.name}</b>
                      <div className="cd-mono">
                        {lead.label || "Unlabeled"} · {lead.shipperRole && lead.shipperRole !== "Unknown" ? lead.shipperRole : "—"} · {companyName(lead) || lead.source}
                      </div>
                    </div>
                    <div className="freight-score">
                      <b>{lead.freightScore ?? "—"}</b>
                      <span>{lead.status}</span>
                    </div>
                  </button>
                ))}
              </section>
              </>
              ) : null}

              <section className="az-panel freight-panel">
                <header>
                  <h3>Follow-ups</h3>
                  <button className="az-btn sm" type="button" onClick={() => router.push("/callbacks")}>
                    All
                  </button>
                </header>
                {followUps.length === 0 ? <p className="rec-empty">Nothing due.</p> : null}
                {followUps.map((item) => {
                  const person = workspace.leads.find((row) => row.id === item.leadId);
                  const late = Date.parse(item.dueAt) < Date.now();
                  return (
                    <div key={item.id} className="work-row">
                      <div>
                        <b>{person?.name || "Unlinked"}</b>
                        <div className="cd-mono">
                          {person?.label ? `${person.label} · ` : ""}
                          {item.reason}
                        </div>
                      </div>
                      <div className="freight-row-actions">
                        <span className={late ? "bad" : ""}>{relativeDue(item.dueAt)}</span>
                        <button className="az-btn sm" type="button" onClick={() => complete(item.id)}>
                          Done
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>

            {hotYards.length > 0 && !stillCalling ? (
              <section className="az-panel freight-panel">
                <header>
                  <h3>High-probability yards</h3>
                  <button className="az-btn sm" type="button" onClick={() => router.push("/playbook")}>
                    Intel
                  </button>
                </header>
                {hotYards.map((lead) => (
                  <button key={lead.id} type="button" className="work-row text-left" onClick={() => openLead(lead.id, workPath(lead.id))}>
                    <div>
                      <b>{lead.name}</b>
                      <div className="cd-mono">
                        {lead.dimensions || lead.weight ? lead.trailerHint || "Trailer from specs" : "Ask trailer on the call"} · {leadLocation(lead) || "—"}
                      </div>
                    </div>
                    <div className="freight-score">
                      <b>{lead.freightScore ?? "—"}</b>
                      <span>{lead.shipperRole || lead.label || "Yard"}</span>
                    </div>
                  </button>
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

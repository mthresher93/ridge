"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { CLIENT_KINDS, MESSAGE_STYLES, companyName, generateFollowUp, generateOpeningMessage, hasMeasuredSpecs, leadLocation, outreachQueue, suggestClientKind, upsertBlankQuote, type ClientKind, type MessageStyle } from "@/lib/freight";
import { recommendEquipment } from "@/lib/equipment";
import { metroOf, sameMetroQueue } from "@/lib/metro";
import { analysisFromLead, firstCall, wrapCall, type CallOutcome } from "@/lib/prospect";
import { messagesSentOnDay, pacingNote } from "@/lib/pacing";
import { daysUntilNextWeekday, nowIso, phonePretty, uid } from "@/lib/format";
import { workPath } from "@/lib/nav";
import { browserTelephony } from "@/lib/telephony";
import { inCallingWindow } from "@/lib/us-time";
import { ScriptPanel } from "./script-panel";
import { settingsWithDefaults } from "@/lib/types";

export function OutreachView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace, setWorkspace, log, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const queue = useMemo(() => outreachQueue(workspace.leads), [workspace.leads]);
  const [index, setIndex] = useState(0);
  const [style, setStyle] = useState<MessageStyle>("Very Short");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [note, setNote] = useState("");
  const [pinned, setPinned] = useState(true);
  const [booker, setBooker] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
  const [dest, setDest] = useState("");
  const [beat, setBeat] = useState(0);
  const [lastDisp, setLastDisp] = useState("");

  const wantedId = searchParams.get("id") || selectedLeadId;
  const thursdayIn = daysUntilNextWeekday(4);

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) return;
    setSelectedLeadId(id);
    setPinned(true);
  }, [searchParams, setSelectedLeadId]);

  useEffect(() => {
    if (!wantedId) return;
    const at = queue.findIndex((item) => item.id === wantedId);
    if (at >= 0) setIndex(at);
  }, [wantedId, queue]);

  const queued = queue[index] || null;
  const focused = pinned && wantedId ? workspace.leads.find((item) => item.id === wantedId && !item.archivedAt) : null;
  const lead = focused || queued;
  const sentToday = messagesSentOnDay(workspace.kpiEvents || []);
  const script = lead ? firstCall(lead, sentToday) : null;
  const analysis = lead ? (workspace.analyses || []).find((item) => item.leadId === lead.id) || analysisFromLead(lead) : null;
  const listing = lead ? (workspace.listings || []).find((item) => item.leadId === lead.id) : null;
  const pace = pacingNote(sentToday);
  const follow = lead ? (workspace.callbacks || []).find((item) => item.leadId === lead.id && item.status === "open") : null;
  const suggested = lead && !lead.label ? suggestClientKind({ sellerName: lead.name, title: lead.listingTitle, source: lead.source, website: lead.website }) : "";
  const prefs = settingsWithDefaults(workspace.settings);
  const hours = lead ? inCallingWindow(lead.state, prefs.dialWindowStart, prefs.dialWindowEnd) : null;
  const metroNext = lead ? sameMetroQueue(workspace.leads, lead, 6) : [];
  useEffect(() => {
    if (!lead) return;
    setBooker(lead.booker || "");
    setBookerPhone(lead.bookerPhone || "");
    setDest(lead.destination || "");
    setBeat(0);
    setLastDisp("");
  }, [lead?.id]);
  const fit = lead
    ? recommendEquipment({
        text: [lead.equipmentType, lead.listingTitle, lead.listingDescription].filter(Boolean).join(" "),
        dimensions: lead.dimensions,
        weight: lead.weight,
      })
    : null;
  const message = lead
    ? style === "Follow-Up"
      ? generateFollowUp(lead, lead.nextAction)
      : generateOpeningMessage(analysis || analysisFromLead(lead), style, lead.id, sentToday)
    : "";

  const go = useCallback((delta: number) => {
    setPinned(false);
    setIndex((n) => Math.min(queue.length - 1, Math.max(0, n + delta)));
    setCopied(false);
    setCopyError("");
    setNote("");
  }, [queue.length]);

  const copy = useCallback(async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setCopyError("");
      if (lead) log("lead", lead.id, "copied_opener", `Copied ${style} opener`);
    } catch {
      setCopied(false);
      setCopyError("Clipboard blocked. Select the message and copy it.");
    }
  }, [lead, log, message, style]);

  const openListing = useCallback(() => {
    const url = lead?.listingUrl || listing?.sourceUrl || lead?.sellerUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, [lead, listing]);

  const noteCall = useCallback(
    (outcome: CallOutcome, advance = false) => {
      if (!lead) return;
      setWorkspace((prev) =>
        wrapCall(prev, lead.id, outcome, {
          booker: booker.trim() || lead.booker,
          bookerPhone: bookerPhone.trim() || lead.bookerPhone,
          notes: note.trim(),
        }),
      );
      log(
        "lead",
        lead.id,
        "call_attempt",
        outcome === "talked" ? "Talked from Work" : outcome === "voicemail" ? "Voicemail from Work" : outcome === "wrong_number" ? "Wrong number from Work" : "No pickup from Work",
      );
      if (outcome === "no_pickup" || outcome === "voicemail") void copy();
      if (advance) go(1);
    },
      [booker, bookerPhone, copy, go, lead, log, note, setWorkspace],
  );

  const mark = useCallback((status: string, detail: string, followDays?: number, advance = false) => {
    if (!lead) return;
    const stamp = nowIso();
    const due = followDays != null ? new Date(Date.now() + followDays * 86400000).toISOString() : lead.nextFollowUp;
    setWorkspace((prev) => ({
      ...prev,
      leads: prev.leads.map((item) =>
        item.id === lead.id
          ? {
              ...item,
              status,
              lastContactAt: status === "Contacted" || status === "Replied" ? stamp : item.lastContactAt,
              attempts: status === "Contacted" ? (item.attempts || 0) + 1 : item.attempts,
              nextFollowUp: due || item.nextFollowUp,
              nextAction: note || (followDays != null ? `Follow up in ${followDays} days` : item.nextAction),
              notes: note ? `${item.notes}\n${note}`.trim() : item.notes,
              tags: status === "Load Lost" ? Array.from(new Set([...(item.tags || []), "not-interested"])) : item.tags,
              updatedAt: stamp,
            }
          : item,
      ),
      opportunities: prev.opportunities.map((item) =>
        item.leadId === lead.id && item.stage !== status
          ? { ...item, stage: status, stageEnteredAt: stamp, updatedAt: stamp, history: [{ from: item.stage, to: status, at: stamp, source: "outreach" }, ...item.history] }
          : item,
      ),
      callbacks:
        followDays != null
          ? [
              {
                id: uid("cb"),
                leadId: lead.id,
                type: "standard" as const,
                dueAt: due,
                reason: note || "No reply after first message.",
                assignedUser: prev.settings.operator,
                notes: note,
                status: "open" as const,
                createdAt: stamp,
              },
              ...prev.callbacks.filter((item) => !(item.leadId === lead.id && item.status === "open")),
            ]
          : prev.callbacks,
      kpiEvents: status === "Contacted" ? [{ id: uid("kpi"), type: "message_sent", leadId: lead.id, at: stamp }, ...prev.kpiEvents] : prev.kpiEvents,
      updatedAt: stamp,
    }));
    log("lead", lead.id, "outreach", detail);
    if (advance) go(1);
  }, [go, lead, log, note, setWorkspace]);

  function setLabel(label: ClientKind) {
    if (!lead) return;
    const next = label === "Unlabeled" ? "" : label;
    setWorkspace((prev) => ({
      ...prev,
      leads: prev.leads.map((item) =>
        item.id === lead.id
          ? {
              ...item,
              label: next,
              nextAction: item.nextAction.startsWith("Label") ? "Copy opener, then you send it" : item.nextAction,
              updatedAt: nowIso(),
            }
          : item,
      ),
      updatedAt: nowIso(),
    }));
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = event.key.toLowerCase();
      if (key === "c") { event.preventDefault(); void copy(); }
      if (key === "o") { event.preventDefault(); openListing(); }
      if (key === "n" || key === "s") { event.preventDefault(); go(1); }
      if (key === "f") { event.preventDefault(); mark("Contacted", "Sent — follow up in 3 days", 3); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copy, go, mark, openListing]);

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading work queue…</div>;

  if (!lead) {
    return (
      <div className="cd-page fill">
        <div className="az-fill crm-desk">
          <header className="crm-desk-head">
            <div>
              <h1>Work</h1>
              <p>Capture a listing, then this screen is label → copy → you send → follow-up.</p>
            </div>
          </header>
          <section className="empty-desk">
            <h2>Nothing to work yet</h2>
            <p>Paste or bookmarklet a live page. Haul copies an opener. You send it. No bots. Soft cap about 25 sent per day.</p>
            <div className="empty-start">
              <article>
                <h3>Capture first</h3>
                <p>Open a live listing, paste it, save. You land here next.</p>
                <button className="az-btn pri sm" type="button" onClick={() => router.push("/discover?tab=paste")}>
                  Paste a listing
                </button>
              </article>
              <article>
                <h3>Check the deck</h3>
                <p>Four questions, then Intel: photo, length, height on the deck, pounds.</p>
                <button className="az-btn sm" type="button" onClick={() => router.push("/playbook")}>
                  Intel
                </button>
              </article>
              <article>
                <h3>Today's hunt</h3>
                <p>If the file is empty, hunt first. Capture is the product.</p>
                <button className="az-btn sm" type="button" onClick={() => router.push("/")}>
                  Desk
                </button>
              </article>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="cd-page fill">
      <div className="outreach-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Work</h1>
            <p>
              {queue.length ? `${index + 1} / ${queue.length}` : "1"} · {metroOf(lead)?.label || leadLocation(lead) || "—"} · {sentToday} sent · C copy · N next
            </p>
          </div>
        </header>
        <div className="outreach-grid">
          <article className="az-panel freight-panel outreach-main">
            <div className="az-kicker">{lead.source}</div>
            <h2>{lead.name}</h2>
            <div className="work-facts">
              <div>
                <span>Who</span>
                <b>{companyName(lead)}</b>
              </div>
              <div>
                <span>Contact</span>
                <b>{lead.booker || lead.homeowner || "Ask who books freight"}</b>
              </div>
              <div>
                <span>Why this call</span>
                <b>{script?.ask || lead.nextAction || "Qualify outbound freight"}</b>
              </div>
              <div>
                <span>Source</span>
                <b>{lead.source || "—"}</b>
              </div>
              <div>
                <span>City</span>
                <b>{leadLocation(lead) || metroOf(lead)?.label || "Location unset"}</b>
              </div>
              <div>
                <span>Last touch</span>
                <b>{lead.lastContactAt ? `${lead.attempts || 0} tries` : "Untried"}</b>
              </div>
            </div>
            <p className="cd-mono">
              {lead.label || suggested || "Unlabeled"} · {companyName(lead)} · {leadLocation(lead) || metroOf(lead)?.label || "Location unset"}
              {(lead.attempts || 0) > 0 ? ` · tried ${lead.attempts}` : " · untried"}
            </p>
            {hours ? (
              <p className={hours.ok ? "cd-mono" : "rec-warn"}>
                {hours.label}. {hours.why}
              </p>
            ) : null}
            {script ? <p className="desk-ask">{script.ask}</p> : null}
            {suggested ? <p className="cd-mono">Looks like a {suggested}. Label it so the opener stays a yard ask.</p> : <p className="cd-mono">Label first. The opener changes for a yard vs a private seller.</p>}
            <div className="label-chips">
              {CLIENT_KINDS.filter((kind) => kind !== "Unlabeled").map((kind) => (
                <button key={kind} type="button" className={`az-btn sm ${lead.label === kind ? "pri" : ""}`} onClick={() => setLabel(kind)}>
                  {kind}
                </button>
              ))}
            </div>
            <div className="freight-intel-grid">
              <div>
                <span>Phone</span>
                <b>{lead.phone ? phonePretty(lead.phone) : "Not on the page"}</b>
              </div>
              <div>
                <span>City</span>
                <b>{leadLocation(lead) || "—"}</b>
              </div>
              <div>
                <span>Dims</span>
                <b>{lead.dimensions || "Ask on the call"}</b>
              </div>
              <div>
                <span>Weight</span>
                <b>{lead.weight || "Ask on the call"}</b>
              </div>
              <div>
                <span>Trailer guess</span>
                <b>{hasMeasuredSpecs(lead) ? lead.trailerHint || (fit ? `${fit.trailerName} · ${fit.loadClass}` : "—") : "Ask on the call"}</b>
              </div>
              <div>
                <span>Screen</span>
                <b>{lead.freightScore ?? "—"}/100</b>
              </div>
            </div>
            <ScriptPanel lead={lead} beat={beat} onBeat={setBeat} large mode="split" />
            {follow ? <p className="cd-mono">Follow-up already set: {follow.reason}</p> : null}
            <h3>Listing</h3>
            <p>{lead.listingTitle || listing?.title || "No title"}</p>
            <p className="cd-mono">{lead.listingDescription || listing?.description || lead.notes}</p>
          </article>
          <aside className="az-panel freight-panel outreach-actions">
            <p className={`pace-${pace.level}`}>{pace.text}</p>
            <p className="cd-mono">Copy, then you send it. Haul does not message anyone. Leave the rate blank.</p>
            {lead.phone ? (
              <button className="az-btn pri" type="button" onClick={() => browserTelephony().startCall(lead.phone)}>
                Call {phonePretty(lead.phone)}
              </button>
            ) : (
              <p className="cd-mono">No published phone. Copy the opener instead.</p>
            )}
            <div className="desk-booker">
              <label className="rec-field">
                Who books freight
                <input className="az-input" value={booker} onChange={(event) => setBooker(event.target.value)} placeholder="Name they gave you" />
              </label>
              <label className="rec-field">
                Direct line
                <input className="az-input" value={bookerPhone} onChange={(event) => setBookerPhone(event.target.value)} placeholder="Only if they gave it" />
              </label>
            </div>
            <label className="rec-field">
              Wrap note
              <input className="az-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Saved on the call event" />
            </label>
            <div className="call-disposition">
              <button className={`az-btn${lastDisp === "no_pickup" ? " on" : ""}`} type="button" onClick={() => { setLastDisp("no_pickup"); noteCall("no_pickup"); }}>
                No pickup
              </button>
              <button className={`az-btn${lastDisp === "voicemail" ? " on" : ""}`} type="button" onClick={() => { setLastDisp("voicemail"); noteCall("voicemail"); }}>
                Voicemail
              </button>
              <button className={`az-btn${lastDisp === "talked" ? " on pri" : ""}`} type="button" onClick={() => { setLastDisp("talked"); noteCall("talked", false); }}>
                Talked
              </button>
              <button className={`az-btn${lastDisp === "wrong_number" ? " on" : ""}`} type="button" onClick={() => { setLastDisp("wrong_number"); noteCall("wrong_number"); }}>
                Wrong number
              </button>
              <button className={`az-btn${lastDisp === "not_interested" ? " on danger" : ""}`} type="button" onClick={() => { setLastDisp("not_interested"); mark("Load Lost", "Not interested"); }}>
                Not interested
              </button>
              <button className={`az-btn${lastDisp === "interested" ? " on" : ""}`} type="button" onClick={() => { setLastDisp("interested"); mark("Replied", "Interested"); }}>
                Interested
              </button>
              <button className={`az-btn${lastDisp === "quote" ? " on pri" : ""}`} type="button" onClick={() => { setLastDisp("quote"); mark("Quote Requested", "Quote opportunity"); }}>
                Quote opportunity
              </button>
              <button className={`az-btn${lastDisp === "follow" ? " on" : ""}`} type="button" onClick={() => { setLastDisp("follow"); mark("Replied", "Follow up", 1); }}>
                Follow up
              </button>
            </div>
            <p className="cd-mono">Voicemail stays here and sets a follow-up for tomorrow. Not a sent message.</p>
            {lead.status === "Contacted" || lead.booker || booker ? (
              <div className="desk-booker">
                <label className="rec-field">
                  Destination (typed — never invented)
                  <input className="az-input" value={dest} onChange={(event) => setDest(event.target.value)} placeholder="City they named" />
                </label>
                <button
                  className="az-btn pri"
                  type="button"
                  onClick={() => {
                    const destination = (dest || lead.destination || "").trim();
                    const contact = (booker || lead.booker || lead.name).trim();
                    const result = upsertBlankQuote(workspace, lead, { destination, contact });
                    const stamp = result.shipment.updatedAt;
                    setWorkspace({
                      ...result.workspace,
                      leads: result.workspace.leads.map((row) =>
                        row.id === lead.id
                          ? {
                              ...row,
                              destination,
                              booker: (booker || row.booker || "").trim(),
                              bookerPhone: (bookerPhone || row.bookerPhone || "").trim(),
                              updatedAt: stamp,
                            }
                          : row,
                      ),
                    });
                    setSelectedLeadId(lead.id);
                    log("shipment", result.shipment.id, result.created ? "created" : "updated", `Blank quote for ${lead.name}`);
                    router.push(`/shipments?id=${result.shipment.id}`);
                  }}
                >
                  Blank quote — rates $0
                </button>
              </div>
            ) : null}
            <label className="rec-field">
              Message style
              <select className="az-select" value={style} onChange={(event) => setStyle(event.target.value as MessageStyle)}>
                {MESSAGE_STYLES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <textarea className="az-area" rows={6} readOnly value={message} />
            <button className="az-btn pri" type="button" onClick={() => void copy()}>
              {copied ? "Copied — now you send it" : "Copy message"}
            </button>
            {copyError ? <p className="rec-warn">{copyError}</p> : null}
            <button className="az-btn" type="button" onClick={openListing} disabled={!lead.listingUrl && !listing?.sourceUrl}>
              Open listing
            </button>
            <input className="az-input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What happened (optional)" />
            <button className="az-btn pri" type="button" onClick={() => mark("Contacted", "Sent — follow up in 3 days", 3)}>
              I sent it — ping in 3 days
            </button>
            <button className="az-btn" type="button" onClick={() => mark("Contacted", `Sent — follow up Thursday`, thursdayIn)}>
              I sent it — ping Thursday
            </button>
            <details className="outreach-more">
              <summary>More</summary>
              <button className="az-btn" type="button" onClick={() => mark("Replied", "Got a reply")}>
                Got a reply
              </button>
              <button className="az-btn" type="button" onClick={() => mark("Contact Info Obtained", "Got a number")}>
                Got a number
              </button>
              <button className="az-btn" type="button" onClick={() => mark("Quote Requested", "They asked for a quote")}>
                They asked for a quote
              </button>
              <button className="az-btn" type="button" onClick={() => mark("Load Lost", "Not a fit")}>
                Not a fit
              </button>
              <button className="az-btn" type="button" onClick={() => go(1)}>
                Skip / next
              </button>
            </details>
            {metroNext.length ? (
              <div className="metro-next">
                <div className="home-kicker">Next in {metroOf(lead)?.label || "this book"}</div>
                {metroNext.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="work-row text-left"
                    onClick={() => {
                      setPinned(true);
                      setSelectedLeadId(item.id);
                      router.push(workPath(item.id));
                    }}
                  >
                    <div>
                      <b>{item.name}</b>
                      <div className="cd-mono">
                        {item.label || "Unlabeled"} · {item.phone ? phonePretty(item.phone) : "no phone"}
                        {(item.attempts || 0) > 0 ? ` · tried ${item.attempts}` : ""}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

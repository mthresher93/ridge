"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { CLIENT_KINDS, MESSAGE_STYLES, companyName, generateFollowUp, generateOpeningMessage, leadLocation, outreachQueue, type ClientKind, type MessageStyle } from "@/lib/freight";
import { CALL_ASK, recommendEquipment } from "@/lib/equipment";
import { messagesSentOnDay, pacingNote } from "@/lib/pacing";
import { daysUntilNextWeekday, nowIso, phonePretty, uid } from "@/lib/format";

export function OutreachView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace, setWorkspace, log, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const queue = useMemo(() => outreachQueue(workspace.leads), [workspace.leads]);
  const [index, setIndex] = useState(0);
  const [style, setStyle] = useState<MessageStyle>("Casual");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [note, setNote] = useState("");
  const [pinned, setPinned] = useState(true);

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
  const analysis = lead ? (workspace.analyses || []).find((item) => item.leadId === lead.id) : null;
  const listing = lead ? (workspace.listings || []).find((item) => item.leadId === lead.id) : null;
  const sentToday = messagesSentOnDay(workspace.kpiEvents || []);
  const pace = pacingNote(sentToday);
  const follow = lead ? (workspace.callbacks || []).find((item) => item.leadId === lead.id && item.status === "open") : null;
  const fit = lead
    ? recommendEquipment({
        text: [lead.equipmentType, lead.listingTitle, lead.listingDescription].filter(Boolean).join(" "),
        dimensions: lead.dimensions,
        weight: lead.weight,
      })
    : null;
  const message = lead
    ? analysis
      ? generateOpeningMessage(analysis, style, lead.id, sentToday)
      : style === "Follow-Up"
        ? generateFollowUp(lead, lead.nextAction)
        : generateOpeningMessage(
            {
              leadId: lead.id,
              score: lead.freightScore || 0,
              confidence: lead.scoreConfidence || "LOW",
              why: lead.scoreWhy || "",
              freightType: lead.freightType || "Unknown",
              recurringPotential: lead.recurringPotential || "Low",
              known: [],
              estimates: [],
              unknown: [],
              openerCasual: `Hey, random question about the ${(lead.equipmentType || "item").toLowerCase()}. If somebody bought it from another state, do you already have someone you normally use to transport it?`,
              openerDirect: "",
              openerBusiness: "",
              openerShort: "",
              openerFollowUp: generateFollowUp(lead),
              analyzedAt: "",
              shipperRole: lead.shipperRole,
              trailerHint: lead.trailerHint,
              loadClass: lead.loadClass,
            },
            style,
            lead.id,
            sentToday,
          )
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
              {queue.length ? `${index + 1} / ${queue.length}` : "1"} · {sentToday} sent today · C copy · O listing · F sent + 3 days · N next
            </p>
          </div>
        </header>
        <div className="outreach-grid">
          <article className="az-panel freight-panel outreach-main">
            <div className="az-kicker">{lead.source}</div>
            <h2>{lead.name}</h2>
            <p className="cd-mono">
              {lead.label || "Unlabeled"} · {companyName(lead)} · {leadLocation(lead) || "Location unset"}
            </p>
            <p className="cd-mono">Label first. The opener changes for a yard vs a private seller.</p>
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
                <b>{lead.dimensions || listing?.dimensions || "Ask on the call"}</b>
              </div>
              <div>
                <span>Weight</span>
                <b>{lead.weight || listing?.weight || "Ask on the call"}</b>
              </div>
              <div>
                <span>Trailer guess</span>
                <b>{lead.dimensions || lead.weight ? lead.trailerHint || (fit ? `${fit.trailerName} · ${fit.loadClass}` : "—") : "Ask on the call"}</b>
              </div>
              <div>
                <span>Screen</span>
                <b>{lead.freightScore ?? "—"}/100</b>
              </div>
            </div>
            <div className="call-ask-block">
              <div className="home-kicker">On the call — then Intel</div>
              <ol className="call-ask">
                {CALL_ASK.map((item) => (
                  <li key={item.id}>{item.ask}</li>
                ))}
              </ol>
              <button className="az-btn sm" type="button" onClick={() => router.push("/playbook")}>
                Open Intel
              </button>
            </div>
            {follow ? <p className="cd-mono">Follow-up already set: {follow.reason}</p> : null}
            <h3>Listing</h3>
            <p>{lead.listingTitle || listing?.title || "No title"}</p>
            <p className="cd-mono">{lead.listingDescription || listing?.description || lead.notes}</p>
          </article>
          <aside className="az-panel freight-panel outreach-actions">
            <p className={`pace-${pace.level}`}>{pace.text}</p>
            <p className="cd-mono">Copy, then you send it. Haul does not message anyone. Leave the rate blank.</p>
            {lead.phone ? (
              <a className="az-btn pri" href={`tel:${lead.phone}`}>
                Call {phonePretty(lead.phone)}
              </a>
            ) : (
              <p className="cd-mono">No published phone. Copy the opener instead.</p>
            )}
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
          </aside>
        </div>
      </div>
    </div>
  );
}

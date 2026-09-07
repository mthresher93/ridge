"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { CLIENT_KINDS, MESSAGE_STYLES, companyName, generateFollowUp, generateOpeningMessage, leadLocation, outreachQueue, type ClientKind, type MessageStyle } from "@/lib/freight";
import { nowIso, phonePretty, uid } from "@/lib/format";

export function OutreachView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const queue = useMemo(() => outreachQueue(workspace.leads), [workspace.leads]);
  const [index, setIndex] = useState(0);
  const [style, setStyle] = useState<MessageStyle>("Casual");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!selectedLeadId) return;
    const at = queue.findIndex((item) => item.id === selectedLeadId);
    if (at >= 0) setIndex(at);
  }, [selectedLeadId, queue]);

  const lead = queue[index] || null;
  const analysis = lead ? (workspace.analyses || []).find((item) => item.leadId === lead.id) : null;
  const listing = lead ? (workspace.listings || []).find((item) => item.leadId === lead.id) : null;
  const message = lead
    ? analysis
      ? generateOpeningMessage(analysis, style)
      : style === "Follow-Up"
        ? generateFollowUp(lead, lead.nextAction)
        : `Hey, random question about the ${(lead.equipmentType || "item").toLowerCase()}. If somebody bought it from another state, do you already have someone you normally use to transport it?`
    : "";

  const go = useCallback((delta: number) => {
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

  const mark = useCallback((status: string, detail: string, followDays?: number) => {
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
              nextAction: note || item.nextAction,
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
                reason: note || (followDays === 2 ? "No reply after first message." : "Scheduled from outreach"),
                assignedUser: prev.settings.operator,
                notes: note,
                status: "open" as const,
                createdAt: stamp,
              },
              ...prev.callbacks,
            ]
          : prev.callbacks,
      kpiEvents: status === "Contacted" ? [{ id: uid("kpi"), type: "message_sent", leadId: lead.id, at: stamp }, ...prev.kpiEvents] : prev.kpiEvents,
      updatedAt: stamp,
    }));
    log("lead", lead.id, "outreach", detail);
    go(1);
  }, [go, lead, log, note, setWorkspace]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = event.key.toLowerCase();
      if (key === "c") { event.preventDefault(); void copy(); }
      if (key === "o") { event.preventDefault(); openListing(); }
      if (key === "n" || key === "s") { event.preventDefault(); go(1); }
      if (key === "f") { event.preventDefault(); mark("Contacted", "Follow-up in 2 days", 2); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copy, go, mark, openListing]);

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading outreach…</div>;

  if (!lead) {
    return (
      <div className="cd-page fill">
        <div className="az-fill crm-desk">
          <header className="crm-desk-head">
            <div>
              <h1>Outreach</h1>
              <p>No one waiting. Capture a listing, label them, then work them here.</p>
            </div>
          </header>
          <section className="empty-desk">
            <h2>You send the message</h2>
            <p>Haul copies an opener. You paste it into Facebook, email, or you dial the dealer’s published number. No bots.</p>
            <button className="az-btn pri" type="button" onClick={() => router.push("/discover")}>
              Go to Discover
            </button>
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
            <h1>Outreach</h1>
            <p>
              {index + 1} / {queue.length} in queue · C copy · O open listing · F follow up · N next
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
            <label className="rec-field">
              Label
              <select
                className="az-select"
                value={lead.label || "Unlabeled"}
                onChange={(event) => {
                  const label = event.target.value as ClientKind;
                  setWorkspace((prev) => ({
                    ...prev,
                    leads: prev.leads.map((item) =>
                      item.id === lead.id ? { ...item, label: label === "Unlabeled" ? "" : label, updatedAt: nowIso() } : item,
                    ),
                    updatedAt: nowIso(),
                  }));
                }}
              >
                {CLIENT_KINDS.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <div className="freight-intel-grid">
              <div>
                <span>Screen</span>
                <b>
                  {lead.freightScore ?? "—"}/100
                </b>
              </div>
              <div>
                <span>Phone</span>
                <b>{lead.phone ? phonePretty(lead.phone) : "Not on the page"}</b>
              </div>
              <div>
                <span>Email</span>
                <b>{lead.email || "—"}</b>
              </div>
            </div>
            <h3>Why this may ship</h3>
            <p>{lead.scoreWhy || analysis?.why || "Capture from Discover for a written rationale."}</p>
            <h3>Listing</h3>
            <p>{lead.listingTitle || listing?.title || "No title"}</p>
            <p className="cd-mono">{lead.listingDescription || listing?.description || lead.notes}</p>
          </article>
          <aside className="az-panel freight-panel outreach-actions">
            <p className="cd-mono">Copy, then you send it. Haul does not message anyone.</p>
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
            <button className="az-btn" type="button" onClick={() => mark("Contacted", "Marked contacted")}>
              I sent it
            </button>
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
            <button className="az-btn" type="button" onClick={() => mark("Contacted", "Follow-up in 2 days", 2)}>
              Follow up in 2 days
            </button>
            <button className="az-btn" type="button" onClick={() => go(1)}>
              Skip / next
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

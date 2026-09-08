"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { derive, topMove } from "@/lib/derive";
import { deskCallBook, deskPlan, todayHunt } from "@/lib/desk";
import { huntQueue } from "@/lib/hunt";
import { DESK_JOB, HOW_VOLUME_GROWS, NO_SPEND } from "@/lib/improve";
import { companyName, leadLocation, outreachQueue, suggestClientKind } from "@/lib/freight";
import { groupByMetro, huntPlacesFromBook, metroOf } from "@/lib/metro";
import { firstCall, labelObviousYards, obviousYardCount, recordCallAttempt, type CallOutcome } from "@/lib/prospect";
import { workPath } from "@/lib/nav";
import { messagesSentOnDay } from "@/lib/pacing";
import { nowIso, phonePretty, relativeDue } from "@/lib/format";
import type { Lead } from "@/lib/types";

export function TodayView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const move = useMemo(() => topMove(workspace), [workspace]);
  const hunt = useMemo(() => todayHunt(new Date(), workspace), [workspace]);
  const queue = useMemo(() => huntQueue(new Date(), 12, huntPlacesFromBook(workspace)), [workspace]);
  const plan = useMemo(() => deskPlan(workspace), [workspace]);
  const callBook = useMemo(() => deskCallBook(workspace, 80), [workspace]);
  const [metroId, setMetroId] = useState("all");
  const metroGroups = useMemo(() => groupByMetro(callBook), [callBook]);
  const filteredBook = useMemo(
    () => (metroId === "all" ? callBook : callBook.filter((lead) => metroOf(lead)?.id === metroId)),
    [callBook, metroId],
  );
  const nextCall = filteredBook[0] || null;
  const nextFive = filteredBook.slice(0, 5);
  const [bookmarklet, setBookmarklet] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [copyError, setCopyError] = useState("");
  const live = useMemo(() => workspace.leads.filter((lead) => !lead.archivedAt), [workspace.leads]);
  const unlabeledAll = useMemo(() => live.filter((lead) => !lead.label), [live]);
  const unlabeled = unlabeledAll.slice(0, 6);
  const obvious = useMemo(() => obviousYardCount(live), [live]);
  const stillCalling = callBook.length > 0;
  const [booker, setBooker] = useState("");
  const [bookerPhone, setBookerPhone] = useState("");
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

  function noteCall(lead: Lead, outcome: CallOutcome, extra?: { booker: string; bookerPhone?: string }) {
    setWorkspace((prev) => recordCallAttempt(prev, lead.id, outcome, nowIso(), extra));
    log(
      "lead",
      lead.id,
      "call_attempt",
      outcome === "talked" ? "Talked from Desk" : outcome === "voicemail" ? "Voicemail from Desk" : outcome === "wrong_number" ? "Wrong number from Desk" : "No pickup from Desk",
    );
    if (outcome === "no_pickup" || outcome === "voicemail") void copyOpener(lead);
    if (outcome === "talked") {
      setBooker("");
      setBookerPhone("");
    }
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
            <h1>Desk</h1>
            <p>
              {live.length
                ? `${live.length} yards on file · ${callBook.length} with a published phone still uncontacted · stay in ${hunt.place} · ${sentToday} sent · $0 spent`
                : `${hunt.weekday} · ${hunt.play.title} · open the queue, then paste. No fake clients.`}
            </p>
          </div>
          <div className="home-stats">
            <div>
              <b>{callBook.length}</b>
              <span>to call</span>
            </div>
            <div>
              <b>{unlabeledAll.length}</b>
              <span>unlabeled</span>
            </div>
            <div>
              <b>{toMessage.length}</b>
              <span>to message</span>
            </div>
            <div>
              <b className={metrics.overdueCallbacks.length ? "bad" : ""}>{metrics.overdueCallbacks.length}</b>
              <span>overdue</span>
            </div>
          </div>
        </header>

        {nextCall && nextScript ? (
          <section className="az-panel freight-panel desk-next">
            <header>
              <div>
                <div className="home-kicker">Next prospect — costs nothing</div>
                <h3>{nextCall.name}</h3>
              </div>
              <span className="cd-mono">
                {nextCall.label || "Unlabeled"} · {leadLocation(nextCall) || "—"} · screen {nextCall.freightScore ?? "—"}
              </span>
            </header>
            <p className="desk-ask">{nextScript.ask}</p>
            <p className="desk-why">{nextScript.why}</p>
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
            </div>
            <div className="desk-next-actions">
              <a className="az-btn pri" href={`tel:${nextCall.phone}`}>
                Call {phonePretty(nextCall.phone)}
              </a>
              <button className="az-btn" type="button" onClick={() => void copyOpener(nextCall)}>
                {copiedId === nextCall.id ? "Copied" : "Copy opener"}
              </button>
              <button className="az-btn pri" type="button" onClick={() => noteCall(nextCall, "talked", { booker: booker.trim(), bookerPhone: bookerPhone.trim() })}>
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
              {!nextCall.label && suggestClientKind({ sellerName: nextCall.name, title: nextCall.listingTitle, source: nextCall.source, website: nextCall.website }) ? (
                <button className="az-btn" type="button" onClick={() => applySuggestedLabel(nextCall)}>
                  Label {suggestClientKind({ sellerName: nextCall.name, title: nextCall.listingTitle, source: nextCall.source, website: nextCall.website })}
                </button>
              ) : null}
              <button className="az-btn" type="button" onClick={() => openLead(nextCall.id, workPath(nextCall.id))}>
                Open in Work
              </button>
            </div>
            {nextFive.length > 1 ? (
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
                    <a href={`tel:${lead.phone}`}>{phonePretty(lead.phone)}</a>
                  </li>
                  );
                })}
              </ol>
            ) : null}
          </section>
        ) : null}

        <section className="az-panel freight-panel desk-from-you">
          <header>
            <div>
              <div className="home-kicker">The job</div>
              <h3>{stillCalling ? "Call this list. Do not hunt more yet." : "Get paid without spending"}</h3>
            </div>
            {obvious ? (
              <button className="az-btn pri sm" type="button" onClick={labelObvious}>
                Label {obvious} obvious yards
              </button>
            ) : (
              <span className="cd-mono">{callBook.length} published phones still uncontacted</span>
            )}
          </header>
          <ol className="desk-from-list">
            {stillCalling
              ? DESK_JOB.map((detail, index) => (
                  <li key={detail}>
                    <b>{index + 1}</b>
                    <div>
                      <p>{detail}</p>
                    </div>
                  </li>
                ))
              : NO_SPEND.map((item) => (
                  <li key={item.n}>
                    <b>{item.n}</b>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
          </ol>
        </section>

        {callBook.length ? (
          <section className="az-panel freight-panel desk-call-book">
            <header>
              <div>
                <div className="home-kicker">Call book</div>
                <h3>Stay in one metro. Untried first.</h3>
              </div>
              <button className="az-btn sm" type="button" onClick={() => router.push("/people")}>
                All {live.length} clients
              </button>
            </header>
            <p className="desk-queue-note">
              Each number was on that dealer’s public page. Dial it. If nobody picks up, copy the opener and you send it. Move' does not place the call.
            </p>
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
                          <a className="az-btn pri sm" href={`tel:${lead.phone}`}>
                            {phonePretty(lead.phone)}
                          </a>
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

        {!stillCalling ? (
          <>
          <section className="desk-today">
          <div className="desk-today-copy">
            <div className="home-kicker">{hunt.weekday} hunt</div>
            <h2>{hunt.play.title}</h2>
            <p>{hunt.why}</p>
            <p className="cd-mono">{hunt.doThis}</p>
            <div className="empty-desk-actions">
              <button className="az-btn pri" type="button" onClick={() => router.push(hunt.href)}>
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
          <p className="desk-queue-note">
            These public pages stay in metros already on this book. Open one, capture it, then the next. Do not rotate to Florida while Texas phones are untried.
          </p>
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

        <section className="az-panel freight-panel desk-improve">
          <header>
            <div>
              <div className="home-kicker">How to improve this</div>
              <h3>What still raises capture — and what will not</h3>
            </div>
          </header>
          <div className="desk-improve-grid">
            {HOW_VOLUME_GROWS.map((item) => (
              <div key={item.title}>
                <b>{item.title}</b>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <ol className="desk-plan">
          {plan.map((item, index) => (
            <li key={`${item.href}-${item.title}`}>
              <button type="button" className="desk-plan-row" onClick={() => router.push(item.href)}>
                <b>{index + 1}</b>
                <div>
                  <span className="home-kicker">{item.kicker}</span>
                  <strong>{item.title}</strong>
                  <p>{item.why}</p>
                </div>
                <em>{item.cta}</em>
              </button>
            </li>
          ))}
        </ol>
          </>
        ) : null}

        {live.length > 0 ? (
          <>
            {!stillCalling ? (
            <section className="freight-hero" onClick={() => openLead(move.leadId, move.href)}>
              <div className="home-kicker">{move.kicker}</div>
              <h2>{move.title}</h2>
              <p>{move.reason}</p>
              <span className="az-btn pri sm">{move.cta}</span>
            </section>
            ) : null}

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

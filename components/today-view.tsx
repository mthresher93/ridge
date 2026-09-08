"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { derive, topMove } from "@/lib/derive";
import { deskCallBook, deskPlan, todayHunt } from "@/lib/desk";
import { huntQueue } from "@/lib/hunt";
import { HOW_VOLUME_GROWS, NO_SPEND } from "@/lib/improve";
import { companyName, leadLocation, outreachQueue } from "@/lib/freight";
import { workPath } from "@/lib/nav";
import { messagesSentOnDay } from "@/lib/pacing";
import { nowIso, phonePretty, relativeDue } from "@/lib/format";

export function TodayView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const move = useMemo(() => topMove(workspace), [workspace]);
  const hunt = useMemo(() => todayHunt(), []);
  const queue = useMemo(() => huntQueue(), []);
  const plan = useMemo(() => deskPlan(workspace), [workspace]);
  const callBook = useMemo(() => deskCallBook(workspace, 20), [workspace]);
  const [bookmarklet, setBookmarklet] = useState("");
  const live = useMemo(() => workspace.leads.filter((lead) => !lead.archivedAt), [workspace.leads]);
  const unlabeled = useMemo(() => live.filter((lead) => !lead.label).slice(0, 6), [live]);
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
                ? `${live.length} yards on file · ${callBook.length} with a published phone still uncontacted · ${sentToday} sent · $0 spent`
                : `${hunt.weekday} · ${hunt.play.title} · open the queue, then paste. No fake clients.`}
            </p>
          </div>
          <div className="home-stats">
            <div>
              <b>{callBook.length}</b>
              <span>to call</span>
            </div>
            <div>
              <b>{unlabeled.length}</b>
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

        <section className="az-panel freight-panel desk-from-you">
          <header>
            <div>
              <div className="home-kicker">Get paid without spending</div>
              <h3>What to do today</h3>
            </div>
            <span className="cd-mono">{callBook.length} numbers you can dial from this phone</span>
          </header>
          <ol className="desk-from-list">
            {NO_SPEND.map((item) => (
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
                <h3>Published yard phones — you dial</h3>
              </div>
              <button className="az-btn sm" type="button" onClick={() => router.push("/people")}>
                All {live.length} clients
              </button>
            </header>
            <p className="desk-queue-note">
              This is the list, not one next card. Each number was on that dealer’s public page. Haul does not place the call.
            </p>
            <div className="desk-call-grid">
              {callBook.map((lead) => (
                <div key={lead.id} className="desk-call-row">
                  <button type="button" className="desk-call-who" onClick={() => openLead(lead.id, workPath(lead.id))}>
                    <b>{lead.name}</b>
                    <span>
                      {lead.label || "Unlabeled"} · {leadLocation(lead) || "—"}
                    </span>
                  </button>
                  <a className="az-btn pri sm" href={`tel:${lead.phone}`}>
                    {phonePretty(lead.phone)}
                  </a>
                </div>
              ))}
            </div>
          </section>
        ) : null}

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
              <h3>Today’s rotating searches</h3>
            </div>
            <button className="az-btn sm" type="button" onClick={() => router.push("/discover")}>
              All plays
            </button>
          </header>
          <p className="desk-queue-note">
            Haul does not scrape. These 12 public pages rotate by calendar day across metros and unit types. Open one, capture it, then the next.
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

        {live.length > 0 ? (
          <>
            <section className="freight-hero" onClick={() => openLead(move.leadId, move.href)}>
              <div className="home-kicker">{move.kicker}</div>
              <h2>{move.title}</h2>
              <p>{move.reason}</p>
              <span className="az-btn pri sm">{move.cta}</span>
            </section>

            <div className="desk-work-grid">
              <section className="az-panel freight-panel">
                <header>
                  <h3>Needs a label</h3>
                  <button className="az-btn sm" type="button" onClick={() => router.push("/people?filter=unlabeled")}>
                    All
                  </button>
                </header>
                {unlabeled.length === 0 ? <p className="rec-empty">Every client is labeled.</p> : null}
                {unlabeled.map((lead) => (
                  <button key={lead.id} type="button" className="work-row text-left" onClick={() => openLead(lead.id, workPath(lead.id))}>
                    <div>
                      <b>{lead.name}</b>
                      <div className="cd-mono">
                        {lead.source} · {leadLocation(lead) || "—"}
                      </div>
                    </div>
                    <span className="az-chip">Unlabeled</span>
                  </button>
                ))}
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

            {hotYards.length ? (
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

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { derive, topMove } from "@/lib/derive";
import { deskPlan, START_CONNECTIONS, todayHunt } from "@/lib/desk";
import { companyName, leadLocation, outreachQueue } from "@/lib/freight";
import { workPath } from "@/lib/nav";
import { messagesSentOnDay } from "@/lib/pacing";
import { nowIso, relativeDue } from "@/lib/format";

export function TodayView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const move = useMemo(() => topMove(workspace), [workspace]);
  const hunt = useMemo(() => todayHunt(), []);
  const plan = useMemo(() => deskPlan(workspace), [workspace]);
  const live = useMemo(() => workspace.leads.filter((lead) => !lead.archivedAt), [workspace.leads]);
  const unlabeled = useMemo(() => live.filter((lead) => !lead.label).slice(0, 6), [live]);
  const toMessage = useMemo(() => outreachQueue(live).slice(0, 6), [live]);
  const followUps = useMemo(
    () => [...metrics.overdueCallbacks, ...metrics.dueCallbacks.filter((item) => !metrics.overdueCallbacks.includes(item))].slice(0, 6),
    [metrics.dueCallbacks, metrics.overdueCallbacks],
  );
  const yards = useMemo(
    () => live.filter((lead) => lead.shipperRole === "Yard" || lead.label === "Dealer" || lead.label === "Rental").length,
    [live],
  );
  const auctions = useMemo(() => live.filter((lead) => lead.shipperRole === "Auction" || lead.label === "Auction").length, [live]);
  const hotYards = useMemo(
    () =>
      live
        .filter((lead) => (lead.shipperRole === "Yard" || lead.label === "Dealer") && (lead.freightScore || 0) >= 70)
        .slice(0, 6),
    [live],
  );
  const sentToday = useMemo(() => messagesSentOnDay(workspace.kpiEvents || []), [workspace.kpiEvents]);

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
                ? `${live.length} on file · ${yards} yards · ${auctions} auctions · ${sentToday} sent today`
                : `${hunt.weekday} · ${hunt.play.title} · ${hunt.query} in ${hunt.place}. No fake clients — capture a live page.`}
            </p>
          </div>
          <div className="home-stats">
            <div>
              <b>{plan.length}</b>
              <span>next</span>
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

        <section className="desk-today">
          <div className="desk-today-copy">
            <div className="home-kicker">Do this next</div>
            <h2>
              {hunt.weekday}: {hunt.play.title}
            </h2>
            <p>{hunt.why}</p>
            <p className="cd-mono">{hunt.doThis}</p>
            <div className="empty-desk-actions">
              <button className="az-btn pri sm" type="button" onClick={() => router.push(hunt.href)}>
                Open {hunt.query} · {hunt.place}
              </button>
              <button className="az-btn sm" type="button" onClick={() => router.push("/playbook")}>
                Check a deck
              </button>
            </div>
          </div>
          <div className="desk-today-links">
            {hunt.links.map((item) => (
              <a key={item.id} className="desk-open-row" href={item.url} target="_blank" rel="noreferrer">
                <span>{item.name}</span>
                <em>Open</em>
              </a>
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

        <section className="desk-connect">
          {START_CONNECTIONS.slice(0, 4).map((item) => (
            <div key={item.name}>
              <span className="az-chip">{item.need}</span>
              <b>{item.name}</b>
              <p>{item.detail}</p>
            </div>
          ))}
        </section>

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

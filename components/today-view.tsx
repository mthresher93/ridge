"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { derive, topMove } from "@/lib/derive";
import { formatWhen, moneyShort, nowIso, relativeDue } from "@/lib/format";

export function TodayView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const move = useMemo(() => topMove(workspace), [workspace]);

  function complete(id: string) {
    setWorkspace((prev) => ({
      ...prev,
      callbacks: prev.callbacks.map((item) => (item.id === id ? { ...item, status: "completed", completedAt: nowIso() } : item)),
      updatedAt: nowIso(),
    }));
    log("callback", id, "completed", "Completed from Home");
  }

  function openLead(id: string | null, href: string) {
    if (id) setSelectedLeadId(id);
    router.push(href);
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Reading workspace…</div>;

  const followUps = [...metrics.overdueCallbacks, ...metrics.dueCallbacks.filter((item) => !metrics.overdueCallbacks.includes(item))].slice(0, 8);
  const sits = metrics.upcoming.slice(0, 6);

  return (
    <div className="cd-page fill">
      <div className="home-desk">
        <header className="home-desk-head">
          <div>
            <h1>Today</h1>
            <p>
              {metrics.overdueCallbacks.length
                ? `${metrics.overdueCallbacks.length} overdue · ${metrics.callable.length} callable`
                : `${metrics.callable.length} callable · ${metrics.dueCallbacks.length} follow-ups`}
            </p>
          </div>
          <div className="home-stats">
            <div>
              <b className={metrics.overdueCallbacks.length ? "bad" : ""}>{metrics.overdueCallbacks.length}</b>
              overdue
            </div>
            <div>
              <b className={metrics.dueCallbacks.length ? "warn" : ""}>{metrics.dueCallbacks.length}</b>
              follow-ups
            </div>
            <div>
              <b>{metrics.todaySits.length}</b>
              sits today
            </div>
            <div>
              <b>{metrics.callable.length}</b>
              callable
            </div>
            <div>
              <b>{moneyShort(metrics.openValue)}</b>
              open pipeline
            </div>
          </div>
        </header>

        <div className="home-main">
        <section className="home-next">
          <div className="home-kicker">{move.kicker}</div>
          <h2>{move.title}</h2>
          <p>{move.reason}</p>
          <div className="home-actions">
            <button className="az-btn pri" type="button" onClick={() => openLead(move.leadId, "/floor")}>
              Dialer
            </button>
            {move.href !== "/floor" ? (
              <button className="az-btn" type="button" onClick={() => openLead(move.leadId, move.href)}>
                {move.cta}
              </button>
            ) : (
              <button className="az-btn" type="button" onClick={() => router.push("/callbacks")}>
                Follow-up
              </button>
            )}
            <button className="az-btn" type="button" onClick={() => router.push("/design")}>
              Design
            </button>
          </div>
        </section>

        <section className="home-col">
          <div className="home-kicker">Follow-up</div>
          {followUps.length === 0 ? <p className="home-empty">Queue is clear.</p> : null}
          {followUps.map((item) => {
            const person = workspace.leads.find((row) => row.id === item.leadId);
            const overdue = Date.parse(item.dueAt) < Date.now();
            return (
              <div key={item.id} className="home-row">
                <div>
                  <b>{person?.name}</b>
                  <span>{item.reason}</span>
                </div>
                <div className="home-row-actions">
                  <span className={`az-chip ${overdue ? "cr" : "warn"}`}>{relativeDue(item.dueAt)}</span>
                  <button className="az-btn sm pri" type="button" onClick={() => openLead(item.leadId, "/floor")}>
                    Call
                  </button>
                  <button className="az-btn sm" type="button" onClick={() => complete(item.id)}>
                    Done
                  </button>
                </div>
              </div>
            );
          })}
        </section>
        </div>

        <section className="home-side">
          <div className="home-kicker">Appointments</div>
          {sits.length === 0 ? <p className="home-empty">Nothing scheduled from this workspace.</p> : null}
          {sits.map((item) => {
            const person = workspace.leads.find((row) => row.id === item.leadId);
            return (
              <div key={item.id} className="home-row">
                <div>
                  <b>{person?.name || item.type}</b>
                  <span>
                    {formatWhen(item.startsAt)} · {item.status}
                  </span>
                </div>
                <div className="home-row-actions">
                  <button className="az-btn sm" type="button" onClick={() => openLead(item.leadId, "/appointments")}>
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

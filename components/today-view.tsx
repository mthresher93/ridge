"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { derive, topMove } from "@/lib/derive";
import { companyName, leadLocation, outreachQueue } from "@/lib/freight";
import { nowIso, relativeDue } from "@/lib/format";

export function TodayView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const move = useMemo(() => topMove(workspace), [workspace]);
  const live = useMemo(() => workspace.leads.filter((lead) => !lead.archivedAt), [workspace.leads]);
  const unlabeled = useMemo(() => live.filter((lead) => !lead.label).slice(0, 6), [live]);
  const toMessage = useMemo(() => outreachQueue(live).slice(0, 6), [live]);
  const followUps = useMemo(
    () => [...metrics.overdueCallbacks, ...metrics.dueCallbacks.filter((item) => !metrics.overdueCallbacks.includes(item))].slice(0, 6),
    [metrics.dueCallbacks, metrics.overdueCallbacks],
  );

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
            <p>{live.length ? `${live.length} clients · hunt, label, you send, follow up, quote` : "Empty file. Capture a live listing to start."}</p>
          </div>
          <div className="home-stats">
            <div>
              <b>{unlabeled.length}</b>
              <span>unlabeled</span>
            </div>
            <div>
              <b>{toMessage.length}</b>
              <span>to message</span>
            </div>
            <div>
              <b>{metrics.overdueCallbacks.length}</b>
              <span>overdue</span>
            </div>
            <div>
              <b>{live.length}</b>
              <span>clients</span>
            </div>
          </div>
        </header>

        {live.length === 0 ? (
          <section className="empty-desk">
            <h2>Hunt → capture → label → you send</h2>
            <ol className="desk-steps">
              <li>Open a live listing you can see.</li>
              <li>Capture it. Lumen scores. You label what they are.</li>
              <li>Copy the opener. You hit send.</li>
              <li>Follow up. Quote only after you have a real rate.</li>
            </ol>
            <button className="az-btn pri" type="button" onClick={() => router.push("/discover")}>
              Go to Discover
            </button>
          </section>
        ) : (
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
                  <button key={lead.id} type="button" className="work-row text-left" onClick={() => openLead(lead.id, `/people?id=${lead.id}`)}>
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
                  <button className="az-btn sm" type="button" onClick={() => router.push("/outreach")}>
                    Outreach
                  </button>
                </header>
                {toMessage.length === 0 ? <p className="rec-empty">Queue is clear.</p> : null}
                {toMessage.map((lead) => (
                  <button key={lead.id} type="button" className="work-row text-left" onClick={() => openLead(lead.id, "/outreach")}>
                    <div>
                      <b>{lead.name}</b>
                      <div className="cd-mono">
                        {lead.label || "Unlabeled"} · {companyName(lead) || lead.source}
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
          </>
        )}
      </div>
    </div>
  );
}

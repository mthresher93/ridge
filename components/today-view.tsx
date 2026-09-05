"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { derive, topMove } from "@/lib/derive";
import { moneyShort, nowIso, relativeDue } from "@/lib/format";
import { PIPELINE_GROUPS } from "@/lib/stages";
import { Station } from "./page-intro";

const FLOW = [
  { n: "01 · Sense", t: "Find demand", d: "Solar inquiries, bills, roof signals, and overdue follow-ups.", out: "sourced opportunity" },
  { n: "02 · Qualify", t: "Verify realness", d: "Buyer pain, value, source quality, authority, timing, and risk.", out: "scored dossier" },
  { n: "03 · Package", t: "Shape offer", d: "System size, price, proof needed, exclusions, next question.", out: "offer packet" },
  { n: "04 · Produce", t: "Draft assets", d: "Proposal, script, sit prep, campaign brief, handoff notes.", out: "local draft" },
  { n: "05 · Route", t: "Stage work", d: "Push to Dialer, Pipeline, Design, Proof, or AI Studio.", out: "next action" },
  { n: "06 · Gate", t: "Approve", d: "No sending, spending, or public claims without a human yes.", out: "human decision" },
];

export function TodayView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const [flow, setFlow] = useState(0);
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const move = useMemo(() => topMove(workspace), [workspace]);
  const lead = workspace.leads.find((item) => item.id === (selectedLeadId || move.leadId)) || workspace.leads[0] || null;
  const max = Math.max(metrics.open.length, metrics.dueCallbacks.length, metrics.callable.length, 1);
  const pulse = PIPELINE_GROUPS.map((group) => {
    const rows = workspace.opportunities.filter((opp) => (group.stages as readonly string[]).includes(opp.stage));
    return { ...group, count: rows.length, value: rows.reduce((sum, opp) => sum + (Number(opp.value) || 0), 0) };
  });
  const hottest = pulse.slice().sort((a, b) => b.value - a.value)[0];

  function complete(id: string) {
    setWorkspace((prev) => ({
      ...prev,
      callbacks: prev.callbacks.map((item) => (item.id === id ? { ...item, status: "completed", completedAt: nowIso() } : item)),
      updatedAt: nowIso(),
    }));
    log("callback", id, "completed", "Completed from Home");
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Reading local workspace…</div>;

  return (
    <Station
      n="00"
      title="Home"
      lede={
        <>
          Priorities for today — follow-ups, appointments, and next actions.
        </>
      }
      chip="LOCAL DATA · LIVE"
      actions={
        <button className="az-btn pri sm" type="button" onClick={() => router.push(move.href)}>
          Stage top action
        </button>
      }
    >
      <div className="home-grid">
        <section className="cd-glass home-flow">
          <div className="cd-mono" style={{ color: "var(--cy)", marginBottom: 8 }}>
            Lumen operating flow · interactive command map
          </div>
          <div className="home-flow-grid">
            {FLOW.map((item, index) => (
              <button key={item.n} type="button" className={`home-flow-step ${flow === index ? "on" : ""}`} onClick={() => setFlow(index)}>
                <div className="n">{item.n}</div>
                <b>{item.t}</b>
                <p>{item.d}</p>
              </button>
            ))}
          </div>
          <div className="home-flow-detail">
            {FLOW[flow].d} Output: {FLOW[flow].out}.
          </div>
        </section>

        <section className="home-hero">
          <div>
            <div className="lbl">Lumen&apos;s top move</div>
            <div className="hd">
              {move.kicker} · <em>{move.title}</em>
            </div>
            <p>{move.reason}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button
                className="az-btn pri"
                type="button"
                onClick={() => {
                  if (lead) setSelectedLeadId(lead.id);
                  router.push("/floor");
                }}
              >
                Open Dialer
              </button>
              <button className="az-btn" type="button" onClick={() => router.push("/design")}>
                Design roof
              </button>
              {move.href !== "/floor" ? (
                <button className="az-btn" type="button" onClick={() => router.push(move.href)}>
                  {move.cta}
                </button>
              ) : (
                <button className="az-btn" type="button" onClick={() => router.push("/callbacks")}>
                  Work callbacks
                </button>
              )}
            </div>
          </div>
          <div className="hero-stat">
            <div className="k">{moneyShort(metrics.openValue)}</div>
            <div className="l">visible pipeline</div>
            <div className="k" style={{ marginTop: 16, color: metrics.overdueCallbacks.length ? "var(--rd)" : "var(--tx)" }}>
              {metrics.overdueCallbacks.length}
            </div>
            <div className="l">overdue</div>
          </div>
        </section>

        <aside className="current-strip">
          <div>
            <div className="who">Lumen · local autonomy</div>
            <div className="what">
              {metrics.coverage}% of open deals have a next action. Hottest stage is <em>{hottest?.label}</em> at {moneyShort(hottest?.value || 0)}.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="az-btn sm" type="button" onClick={() => router.push("/money")}>
              Money review
            </button>
            <button className="az-btn pri sm" type="button" onClick={() => router.push("/callbacks")}>
              Work callbacks
            </button>
          </div>
        </aside>

        <div className="metric-strip">
          <button className="ms-cell" type="button" onClick={() => router.push("/people")}>
            <div className="ms-l">Qualified accounts</div>
            <div className="ms-v cy">{workspace.leads.filter((item) => /Qualified|Appointment|Proposal|Contract/.test(item.status)).length}</div>
            <div className="ms-d">local CRM</div>
          </button>
          <button className="ms-cell" type="button" onClick={() => router.push("/people")}>
            <div className="ms-l">Decision makers</div>
            <div className="ms-v">{workspace.leads.length}</div>
            <div className="ms-d">leads</div>
          </button>
          <button className="ms-cell" type="button" onClick={() => router.push("/floor")}>
            <div className="ms-l">Ready demand</div>
            <div className="ms-v" style={{ color: "var(--tl)" }}>
              {metrics.callable.length}
            </div>
            <div className="ms-d">callable now</div>
          </button>
          <button className="ms-cell" type="button" onClick={() => router.push("/proof")}>
            <div className="ms-l">Proof-backed</div>
            <div className="ms-v" style={{ color: "var(--am)" }}>
              {workspace.leads.filter((item) => item.notes).length}
            </div>
            <div className="ms-d">noted records</div>
          </button>
          <button className="ms-cell" type="button" onClick={() => router.push("/board")}>
            <div className="ms-l">Blocked pipeline</div>
            <div className="ms-v" style={{ color: "var(--rd)" }}>
              {metrics.stalled.length}
            </div>
            <div className="ms-d">stalled deals</div>
          </button>
          <button className="ms-cell" type="button" onClick={() => router.push("/investment")}>
            <div className="ms-l">Designs live</div>
            <div className="ms-v" style={{ color: "var(--vi)" }}>
              {Object.keys(workspace.designs || {}).length}
            </div>
            <div className="ms-d">roof models</div>
          </button>
        </div>

        <section className="cd-glass" style={{ gridColumn: "span 8", padding: 0 }}>
          <div className="cd-head">
            <h3>Live local dashboard</h3>
            <span className="r">counts · not projections</span>
          </div>
          <div className="live-bars">
            {[
              ["Qualified", workspace.leads.filter((item) => item.status.includes("Qualified")).length],
              ["Demand", metrics.callable.length],
              ["Sits", metrics.upcoming.length],
              ["Due", metrics.dueCallbacks.length],
              ["Overdue", metrics.overdueCallbacks.length],
              ["Stalled", metrics.stalled.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="live-bar">
                <div className="az-num">{value}</div>
                <div className="bar" style={{ height: `${Math.max(8, (Number(value) / max) * 100)}%` }} />
                <div className="lab">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="cd-glass" style={{ gridColumn: "span 4" }}>
          <div className="cd-head">
            <h3>Recommended next</h3>
            <span className="r">live/local only</span>
          </div>
          <div style={{ padding: "4px 16px 12px" }}>
            {metrics.overdueCallbacks.slice(0, 5).map((item) => {
              const person = workspace.leads.find((row) => row.id === item.leadId);
              return (
                <div key={item.id} className="cd-row">
                  <div>
                    <b>{person?.name}</b>
                    <div className="cd-mono">{item.reason}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="cd-chip cr">{relativeDue(item.dueAt)}</span>
                    <button
                      className="az-btn sm pri"
                      type="button"
                      onClick={() => {
                        setSelectedLeadId(item.leadId);
                        router.push("/floor");
                      }}
                    >
                      Call
                    </button>
                    <button className="az-btn sm" type="button" onClick={() => complete(item.id)}>
                      Done
                    </button>
                  </div>
                </div>
              );
            })}
            {metrics.overdueCallbacks.length === 0 ? <p className="cd-mono">Queue is clear.</p> : null}
          </div>
        </section>
      </div>
    </Station>
  );
}

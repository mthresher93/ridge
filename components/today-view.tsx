"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { derive, topMove } from "@/lib/derive";
import { formatWhen, moneyShort, nowIso, relativeDue } from "@/lib/format";
import { PIPELINE_GROUPS } from "@/lib/stages";
import { estimateFor } from "@/lib/solar";
import { ScriptPanel } from "./script-panel";

export function TodayView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const [beat, setBeat] = useState(0);
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const move = useMemo(() => topMove(workspace), [workspace]);
  const lead = workspace.leads.find((item) => item.id === (selectedLeadId || move.leadId)) || workspace.leads[0] || null;
  const design = lead ? workspace.designs?.[lead.id] : null;
  const estimate = lead && design ? estimateFor(lead, design) : null;
  const dialTarget = workspace.settings.dialTarget || 80;
  const dialsToday = workspace.kpiEvents.filter((item) => item.type === "dial_attempt" && item.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  const pulse = PIPELINE_GROUPS.map((group) => {
    const rows = workspace.opportunities.filter((opp) => (group.stages as readonly string[]).includes(opp.stage));
    return { ...group, count: rows.length, value: rows.reduce((sum, opp) => sum + (Number(opp.value) || 0), 0) };
  });
  const maxValue = Math.max(...pulse.map((item) => item.value), 1);
  const queue = [...metrics.overdueCallbacks, ...metrics.dueCallbacks]
    .filter((item, index, all) => all.findIndex((row) => row.id === item.id) === index)
    .slice(0, 8);

  function completeCallback(id: string) {
    setWorkspace((prev) => ({
      ...prev,
      callbacks: prev.callbacks.map((item) => (item.id === id ? { ...item, status: "completed", completedAt: nowIso() } : item)),
      updatedAt: nowIso(),
    }));
    log("callback", id, "completed", "Callback completed from Today");
  }

  function snoozeCallback(id: string) {
    const due = new Date();
    due.setDate(due.getDate() + 1);
    due.setHours(10, 0, 0, 0);
    setWorkspace((prev) => ({
      ...prev,
      callbacks: prev.callbacks.map((item) => (item.id === id ? { ...item, dueAt: due.toISOString() } : item)),
      updatedAt: nowIso(),
    }));
    log("callback", id, "snoozed", "Callback snoozed +1 day");
  }

  if (loading) return <div className="text-[var(--muted)]">Orienting…</div>;

  return (
    <div className="desk">
      <section className="az-panel desk-hero px-4 py-3 grid grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(90px,0.7fr))] gap-3 items-center">
        <div className="min-w-0">
          <div className="az-kicker">{move.kicker}</div>
          <div className="az-title mt-0.5 truncate">{move.title}</div>
          <p className="text-[12px] text-[var(--muted)] truncate">{move.reason}</p>
          {metrics.todaySits[0] ? (
            <p className="text-[11px] text-[var(--gold-2)] mt-1 truncate">
              Sit · {workspace.leads.find((row) => row.id === metrics.todaySits[0].leadId)?.name} {formatWhen(metrics.todaySits[0].startsAt)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 mt-2">
            {lead ? (
              <button
                type="button"
                className="az-btn pri"
                onClick={() => {
                  setSelectedLeadId(lead.id);
                  router.push("/floor");
                }}
              >
                Call now
              </button>
            ) : null}
            {lead ? (
              <button
                type="button"
                className="az-btn"
                onClick={() => {
                  setSelectedLeadId(lead.id);
                  router.push("/design");
                }}
              >
                Design
              </button>
            ) : null}
          </div>
        </div>
        <Stat label="Pipeline" value={moneyShort(metrics.openValue)} detail={`${metrics.open.length} open`} />
        <Stat label="Due" value={`${metrics.dueCallbacks.length}`} detail={`${metrics.overdueCallbacks.length} late`} warn={metrics.overdueCallbacks.length > 0} />
        <Stat label="Sits" value={`${metrics.todaySits.length}`} detail={`${metrics.upcoming.length} up`} />
        <Stat label="Dials" value={`${dialsToday}`} detail={`of ${dialTarget} target`} />
      </section>

      <section className="az-panel overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--line)]">
          <span className="text-[12px]">Queue</span>
          <Link href="/floor" className="az-kicker">
            Dialer
          </Link>
        </div>
        <div className="scroll-y flex-1">
          {queue.length === 0 ? (
            <div className="px-3 py-8 text-[12px] text-[var(--muted)] text-center">Queue is clear. Open Dialer for the next callable lead.</div>
          ) : null}
          {queue.map((item) => {
            const person = workspace.leads.find((row) => row.id === item.leadId);
            const overdue = Date.parse(item.dueAt) < Date.now();
            return (
              <div
                key={item.id}
                className={`px-3 py-2 border-b border-[var(--line)] ${lead?.id === item.leadId ? "bg-[var(--gold-dim)]" : ""}`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    setSelectedLeadId(item.leadId);
                    setBeat(0);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-[13px]">{person?.name}</b>
                    <span className={`az-num text-[11px] ${overdue ? "text-[var(--down)]" : "text-[var(--muted)]"}`}>
                      {relativeDue(item.dueAt)}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--muted)] truncate">{item.reason}</div>
                </button>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <button
                    type="button"
                    className="az-btn pri"
                    style={{ padding: "0.2rem 0.55rem", fontSize: 11 }}
                    onClick={() => {
                      setSelectedLeadId(item.leadId);
                      router.push("/floor");
                    }}
                  >
                    Call
                  </button>
                  <button type="button" className="az-btn" style={{ padding: "0.2rem 0.55rem", fontSize: 11 }} onClick={() => completeCallback(item.id)}>
                    Done
                  </button>
                  <button type="button" className="az-btn ghost" style={{ padding: "0.2rem 0.55rem", fontSize: 11 }} onClick={() => snoozeCallback(item.id)}>
                    +1 day
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-rows-[1fr_auto] gap-2 min-h-0">
        <section className="az-panel p-3 overflow-hidden flex flex-col min-h-0">
          <div className="flex justify-between mb-2">
            <span className="text-[12px]">Board</span>
            <Link href="/board" className="az-kicker">
              Open
            </Link>
          </div>
          <div className="space-y-1.5">
            {pulse.map((item) => (
              <div key={item.id} className="grid grid-cols-[64px_1fr_28px] gap-2 items-center">
                <span className="text-[11px] text-[var(--muted)]">{item.label}</span>
                <div className="h-[5px] bg-[var(--track)] overflow-hidden">
                  <div className="h-full bg-[var(--gold)]" style={{ width: `${Math.max(8, (item.value / maxValue) * 100)}%` }} />
                </div>
                <span className="az-num text-[10px] text-right text-[var(--muted)]">{item.count}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--faint)]">Sits</div>
          <div className="mt-1 space-y-1.5">
            {metrics.upcoming.slice(0, 4).map((item) => {
              const person = workspace.leads.find((row) => row.id === item.leadId);
              return (
                <div key={item.id} className="flex justify-between gap-2 text-[12px]">
                  <span className="truncate">{person?.name}</span>
                  <span className="az-num text-[var(--gold)]">{formatWhen(item.startsAt)}</span>
                </div>
              );
            })}
            {metrics.upcoming.length === 0 ? <div className="text-[12px] text-[var(--muted)]">No sits on the book.</div> : null}
          </div>
          <div className="mt-3 text-[9px] font-mono uppercase tracking-[0.14em] text-[var(--faint)]">Hot paper</div>
          <div className="mt-1 space-y-1.5 scroll-y flex-1">
            {workspace.opportunities
              .filter((item) => /Proposal|Contract|Appointment/.test(item.stage))
              .slice(0, 5)
              .map((item) => (
                <button
                  key={item.id}
                  className="w-full flex justify-between gap-2 text-[12px] text-left hover:text-[var(--gold-2)]"
                  onClick={() => item.leadId && setSelectedLeadId(item.leadId)}
                >
                  <span className="truncate">{item.name}</span>
                  <span className="az-num text-[var(--muted)] shrink-0">{moneyShort(item.value)}</span>
                </button>
              ))}
          </div>
        </section>
        <Link href="/design" className="az-panel px-3 py-2 flex items-center justify-between">
          <div>
            <div className="az-kicker">Design</div>
            <div className="text-[12px]">{lead?.name} · {design ? `${design.azimuthDeg}°` : "no heading"}</div>
          </div>
          <span className="az-num text-[var(--gold-2)]">{estimate ? `${estimate.systemKw} kW` : "Size"}</span>
        </Link>
      </div>

      <ScriptPanel lead={lead} design={design} beat={beat} onBeat={setBeat} />
    </div>
  );
}

function Stat({ label, value, detail, warn }: { label: string; value: string; detail: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--faint)]">{label}</div>
      <div className={`az-num text-[18px] ${warn ? "text-[var(--down)]" : ""}`}>{value}</div>
      <div className="text-[10px] text-[var(--muted)] truncate">{detail}</div>
    </div>
  );
}

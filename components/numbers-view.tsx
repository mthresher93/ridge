"use client";

import { useMemo } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { derive } from "@/lib/derive";
import { PIPELINE_GROUPS } from "@/lib/stages";
import { formatWhen, money, moneyShort } from "@/lib/format";
import { PageDesk } from "./page-desk";

export function NumbersView() {
  const { workspace, loading } = useWorkspace();
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const groups = PIPELINE_GROUPS.map((group) => {
    const rows = workspace.opportunities.filter((item) => (group.stages as readonly string[]).includes(item.stage));
    return {
      ...group,
      count: rows.length,
      value: rows.reduce((sum, item) => sum + (Number(item.value) || 0), 0),
    };
  });
  const max = Math.max(...groups.map((item) => item.value), 1);
  const calls = (workspace.callLogs || []).slice(0, 8);

  if (loading) return <div className="text-[var(--muted)]">Crunching the tape…</div>;

  return (
    <PageDesk script={false}>
      <div className="az-fill" style={{ gridTemplateRows: "auto auto minmax(0,1fr)" }}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="az-title">Reports</div>
          <span className="text-[11px] text-[var(--muted)]">Recorded events only</span>
        </div>

        <div className="report-kpis">
          <Kpi label="Dials" value={`${metrics.attempts}`} detail={`target ${workspace.settings.dialTarget}`} />
          <Kpi label="Connect" value={`${metrics.connectRate}%`} detail={`${metrics.connected} live`} />
          <Kpi label="Set" value={`${metrics.setRate}%`} detail={`${metrics.sets} sits`} />
          <Kpi label="Open" value={moneyShort(metrics.openValue)} detail={`${moneyShort(metrics.weighted)} wtd`} />
          <Kpi
            label="Pace"
            value={`${Math.min(100, Math.round((metrics.attempts / Math.max(1, workspace.settings.dialTarget)) * 100))}%`}
            detail="of dial target"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 min-h-0">
          <section className="az-panel p-3 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px]">Pipeline</span>
              <span className="az-num text-[11px] text-[var(--muted)]">{moneyShort(metrics.openValue)}</span>
            </div>
            <div className="space-y-1.5">
              {groups.map((item) => (
                <div key={item.id} className="grid grid-cols-[72px_1fr_56px] gap-2 items-center">
                  <span className="text-[12px] truncate">{item.label}</span>
                  <div className="h-[5px] bg-[var(--track)] overflow-hidden">
                    <div className="h-full bg-[var(--gold)]" style={{ width: `${(item.value / max) * 100}%` }} />
                  </div>
                  <span className="az-num text-[10px] text-right text-[var(--muted)]">{item.count}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-auto pt-3">
              <div className="border border-[var(--line)] px-2 py-1.5">
                <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--faint)]">Won-adj</div>
                <div className="az-num">{money(metrics.wonValue)}</div>
              </div>
              <div className="border border-[var(--line)] px-2 py-1.5">
                <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--faint)]">Cover</div>
                <div className="az-num">{metrics.coverage}%</div>
              </div>
            </div>
          </section>

          <section className="az-panel overflow-hidden flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-[var(--line)] text-[12px]">Tape</div>
            <div className="scroll-y flex-1">
              <table className="az-table">
                <tbody>
                  {(calls.length ? calls.map((row) => ({ id: row.id, at: row.at, type: row.outcome, leadId: row.leadId })) : workspace.kpiEvents.slice(0, 10)).map((event) => {
                    const lead = workspace.leads.find((item) => item.id === event.leadId);
                    return (
                      <tr key={event.id} className="cursor-default">
                        <td className="az-num text-[11px] whitespace-nowrap">{formatWhen(event.at)}</td>
                        <td className="text-[12px]">{event.type.replaceAll("_", " ")}</td>
                        <td className="text-[12px]">{lead?.name || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </PageDesk>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="report-kpi">
      <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-[var(--faint)]">{label}</div>
      <div className="az-num text-[20px] leading-tight">{value}</div>
      <div className="text-[10px] text-[var(--muted)]">{detail}</div>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { derive } from "@/lib/derive";
import { PIPELINE_GROUPS } from "@/lib/stages";
import { formatWhen, money, moneyShort } from "@/lib/format";
import { downloadText } from "@/lib/contacts";

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

  if (loading) return <div className="cd-body text-[var(--tx4)]">Crunching the tape…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Reports</h1>
            <p>From recorded call history</p>
          </div>
          <button
            className="az-btn sm"
            type="button"
            onClick={() => {
              const tape = (workspace.callLogs || []).map((row) =>
                [row.at, row.outcome, row.duration, workspace.leads.find((lead) => lead.id === row.leadId)?.name || ""].join(","),
              );
              const stages = groups.map((item) => [item.label, item.count, item.value].join(","));
              downloadText(
                "haul-reports.csv",
                ["metric,value", `dials,${metrics.attempts}`, `connect,${metrics.connectRate}`, `set,${metrics.setRate}`, `open,${metrics.openValue}`, "", "stage,count,value", ...stages, "", "at,outcome,seconds,contact", ...tape].join("\n"),
              );
            }}
          >
            Export CSV
          </button>
        </header>

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
    </div>
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

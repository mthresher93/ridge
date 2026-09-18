"use client";

import { useMemo } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { money } from "@/lib/format";
import { dealsByStage } from "@/lib/crm-pipeline";
import { PageHeader } from "./crm/page-header";

export function ReportsView() {
  const { workspace, loading } = useWorkspace();
  const columns = useMemo(() => dealsByStage(workspace), [workspace]);
  const live = workspace.leads.filter((lead) => !lead.archivedAt);
  const named = live.filter((lead) => lead.booker).length;
  const called = live.filter((lead) => (lead.attempts || 0) > 0).length;
  const value = columns.reduce((sum, col) => sum + col.value, 0);

  if (loading) return <div className="cd-body text-[var(--vx-text-3)]">Loading reports…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <PageHeader title="Reports" subtitle="Counts from this workspace. No invented conversion rates." />
        <div className="home-stats report-stats">
          <div>
            <b className="tabular-nums font-display">{live.length}</b>
            <span>Leads</span>
          </div>
          <div>
            <b className="tabular-nums font-display">{called}</b>
            <span>Called</span>
          </div>
          <div>
            <b className="tabular-nums font-display">{named}</b>
            <span>Named bookers</span>
          </div>
          <div>
            <b className="tabular-nums font-display">{value ? money(value) : "—"}</b>
            <span>Pipeline value</span>
          </div>
        </div>
        <div className="az-panel overflow-auto min-h-0 crm-table-wrap">
          <table className="az-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Deals</th>
                <th>Value</th>
                <th>Win %</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr key={col.stage.id} className="cursor-default">
                  <td>{col.stage.label}</td>
                  <td className="tabular-nums">{col.deals.length}</td>
                  <td className="az-num tabular-nums">{col.value ? money(col.value) : "—"}</td>
                  <td className="tabular-nums">{col.stage.probability}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

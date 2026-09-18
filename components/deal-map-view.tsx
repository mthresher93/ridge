"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { groupByMetro } from "@/lib/metro";
import { crmStageOf, stageById } from "@/lib/crm-pipeline";
import { workPath } from "@/lib/nav";
import { PageHeader } from "./crm/page-header";

const PIN: Record<string, { x: number; y: number; lx: number; ly: number }> = {
  dallas: { x: 64, y: 34, lx: 76, ly: 32 },
  fortworth: { x: 46, y: 36, lx: 32, ly: 34 },
  houston: { x: 74, y: 58, lx: 86, ly: 58 },
  austin: { x: 54, y: 54, lx: 54, ly: 64 },
  sanantonio: { x: 44, y: 70, lx: 30, ly: 72 },
  waco: { x: 58, y: 46, lx: 58, ly: 38 },
  east: { x: 80, y: 40, lx: 80, ly: 30 },
  west: { x: 22, y: 42, lx: 22, ly: 32 },
  valley: { x: 50, y: 84, lx: 50, ly: 93 },
  other: { x: 28, y: 20, lx: 28, ly: 12 },
};

export function DealMapView() {
  const router = useRouter();
  const { workspace, loading, setSelectedLeadId } = useWorkspace();
  const live = workspace.leads.filter((lead) => !lead.archivedAt);
  const groups = useMemo(() => groupByMetro(live), [live]);

  if (loading) return <div className="cd-body text-[var(--vx-text-3)]">Loading map…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <PageHeader
          title="Deal map"
          subtitle="Texas metros with yards on the book. Pins are counts, not live GPS."
          controls={
            <button className="az-btn pri sm" type="button" onClick={() => router.push("/pipeline")}>
              Open pipeline
            </button>
          }
        />
        <div className="deal-map-layout">
          <svg className="deal-map-canvas" viewBox="0 0 100 100" role="img" aria-label="Texas deal map">
            <rect x="4" y="8" width="92" height="86" rx="8" fill="var(--vx-bg-surface)" stroke="var(--vx-border-subtle)" />
            {groups.map((group) => {
              const pin = PIN[group.id] || PIN.other;
              const labelX = pin.lx ?? pin.x;
              const labelY = pin.ly ?? pin.y + 8;
              return (
                <g key={group.id}>
                  <circle cx={pin.x} cy={pin.y} r="4.2" fill="var(--vx-sun)" />
                  <text x={pin.x} y={pin.y + 1.2} textAnchor="middle" fontSize="3.2" fill="var(--vx-bg-canvas)" className="tabular-nums">
                    {group.leads.length}
                  </text>
                  <text x={labelX} y={labelY} textAnchor="middle" fontSize="3.4" fill="var(--vx-text-2)">
                    {group.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <section className="az-panel overflow-auto">
            {groups.map((group) => (
              <div key={group.id} className="deal-map-group">
                <header>
                  <b>{group.label}</b>
                  <span className="tabular-nums">{group.leads.length}</span>
                </header>
                {group.leads.slice(0, 8).map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    className="work-row text-left"
                    onClick={() => {
                      setSelectedLeadId(lead.id);
                      router.push(workPath(lead.id));
                    }}
                  >
                    <div>
                      <b>{lead.name}</b>
                      <div className="cd-mono">{stageById(crmStageOf(lead, workspace)).label}</div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

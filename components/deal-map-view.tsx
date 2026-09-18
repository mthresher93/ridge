"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { groupByMetro } from "@/lib/metro";
import { crmStageOf, stageById } from "@/lib/crm-pipeline";
import { workPath } from "@/lib/nav";
import { PageHeader } from "./crm/page-header";

const PIN: Record<string, { x: number; y: number }> = {
  dallas: { x: 58, y: 38 },
  fortworth: { x: 52, y: 40 },
  houston: { x: 72, y: 62 },
  austin: { x: 54, y: 58 },
  sanantonio: { x: 50, y: 68 },
  waco: { x: 56, y: 48 },
  east: { x: 74, y: 42 },
  west: { x: 28, y: 42 },
  valley: { x: 48, y: 82 },
  other: { x: 40, y: 28 },
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
              return (
                <g key={group.id}>
                  <circle cx={pin.x} cy={pin.y} r="4.2" fill="var(--vx-sun)" />
                  <text x={pin.x} y={pin.y + 1.2} textAnchor="middle" fontSize="3.2" fill="var(--vx-bg-canvas)" className="tabular-nums">
                    {group.leads.length}
                  </text>
                  <text x={pin.x} y={pin.y + 8} textAnchor="middle" fontSize="3.4" fill="var(--vx-text-2)">
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

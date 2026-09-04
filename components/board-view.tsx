"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { PIPELINE_GROUPS } from "@/lib/stages";
import { opportunityUrgency } from "@/lib/derive";
import { daysBetween, money, moneyShort, nowIso, uid } from "@/lib/format";
import { DealDrawer } from "./deal-drawer";
import { PageDesk } from "./page-desk";
import type { Opportunity } from "@/lib/types";

export function BoardView() {
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const selected = workspace.opportunities.find((item) => item.id === selectedId) || null;
  const openValue = useMemo(
    () => workspace.opportunities.reduce((sum, item) => sum + (Number(item.value) || 0), 0),
    [workspace.opportunities],
  );

  function moveDeal(id: string, stage: string) {
    setWorkspace((prev) => ({
      ...prev,
      opportunities: prev.opportunities.map((item) => {
        if (item.id !== id || item.stage === stage) return item;
        return {
          ...item,
          stage,
          stageEnteredAt: nowIso(),
          updatedAt: nowIso(),
          history: [{ from: item.stage, to: stage, at: nowIso(), source: "board" }, ...item.history],
        };
      }),
      leads: prev.leads.map((lead) => {
        const opp = prev.opportunities.find((item) => item.id === id);
        if (!opp || opp.leadId !== lead.id) return lead;
        return { ...lead, status: stage, updatedAt: nowIso() };
      }),
      updatedAt: nowIso(),
    }));
    log("opportunity", id, "stage_change", `Moved to ${stage}`);
  }

  function addDeal() {
    const id = uid("opp");
    const opp: Opportunity = {
      id,
      leadId: null,
      name: "New rooftop",
      property: "",
      stage: "New Lead",
      value: 0,
      probability: 10,
      owner: workspace.settings.defaultOwner,
      source: "Manual",
      nextAction: "Qualify bill and roof",
      expectedClose: "",
      notes: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      stageEnteredAt: nowIso(),
      history: [],
    };
    setWorkspace((prev) => ({ ...prev, opportunities: [opp, ...prev.opportunities], updatedAt: nowIso() }));
    setSelectedId(id);
  }

  if (loading) return <div className="text-[var(--muted)]">Loading board…</div>;

  return (
    <PageDesk>
    <div className="az-fill" style={{ gridTemplateRows: "auto minmax(0,1fr)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="az-title">Board</div>
        <div className="flex items-center gap-3">
          <span className="az-num text-[var(--muted)]">{moneyShort(openValue)}</span>
          <button className="az-btn pri" onClick={addDeal}>
            New deal
          </button>
        </div>
      </div>

      <div className="board">
        {PIPELINE_GROUPS.map((group) => {
          const rows = workspace.opportunities.filter((item) => (group.stages as readonly string[]).includes(item.stage));
          const value = rows.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
          return (
            <section
              key={group.id}
              className="board-col"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragging) moveDeal(dragging, group.drop);
                setDragging(null);
              }}
            >
              <div className="px-3 py-2 border-b border-[var(--line)] flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-medium">{group.label}</div>
                  <div className="text-[11px] text-[var(--muted)] az-num">
                    {rows.length} · {moneyShort(value)}
                  </div>
                </div>
              </div>
              <div className="p-2 space-y-2 scroll-y flex-1">
                {rows.map((item) => {
                  const urgency = opportunityUrgency(item);
                  return (
                    <button
                      key={item.id}
                      draggable
                      onDragStart={() => setDragging(item.id)}
                      onClick={() => {
                        setSelectedId(item.id);
                        if (item.leadId) setSelectedLeadId(item.leadId);
                      }}
                      className={`board-card ${urgency}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`az-chip ${urgency === "healthy" ? "ok" : urgency}`}>{item.stage}</span>
                        <span className="az-num text-[11px] text-[var(--faint)]">{daysBetween(item.stageEnteredAt)}d</span>
                      </div>
                      <div className="font-medium text-[13px]">{item.name}</div>
                      <div className="text-[11px] text-[var(--muted)] truncate">{item.property || "Property unset"}</div>
                      <div className="flex items-baseline justify-between mt-2">
                        <b className="az-num text-[var(--gold-2)]">{money(item.value)}</b>
                        <span className="az-num text-[11px] text-[var(--muted)]">{item.probability}%</span>
                      </div>
                      <div className="h-1 bg-[var(--track)] mt-1.5 overflow-hidden">
                        <i className="block h-full bg-[var(--gold)]" style={{ width: `${item.probability}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {selected ? <DealDrawer opportunity={selected} onClose={() => setSelectedId(null)} /> : null}
    </div>
    </PageDesk>
  );
}

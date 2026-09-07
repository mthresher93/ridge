"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { PIPELINE_GROUPS, STAGES } from "@/lib/stages";
import { nowIso } from "@/lib/format";
import { DealDrawer } from "./deal-drawer";

export function BoardView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [mode, setMode] = useState<"board" | "table">("board");

  const selected = workspace.opportunities.find((item) => item.id === selectedId) || null;
  const live = workspace.opportunities.filter((item) => item.stage !== "Load Lost");

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

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading pipeline…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Pipeline</h1>
            <p>{live.length} open · Hunt → Talk → Quote → Close. Rates stay blank until you enter one.</p>
          </div>
          <div className="work-tabs">
            <button type="button" className={`az-btn sm ${mode === "board" ? "pri" : ""}`} onClick={() => setMode("board")}>
              Board
            </button>
            <button type="button" className={`az-btn sm ${mode === "table" ? "pri" : ""}`} onClick={() => setMode("table")}>
              Table
            </button>
            <button className="az-btn pri sm" type="button" onClick={() => router.push("/discover")}>
              Hunt a listing
            </button>
          </div>
        </header>

        {mode === "board" ? (
          <div className="board pipeline-board">
            {PIPELINE_GROUPS.map((group) => {
              const rows = workspace.opportunities.filter((item) => (group.stages as readonly string[]).includes(item.stage));
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
                  <div className="board-col-head">
                    <div className="board-col-title">{group.label}</div>
                    <div className="board-col-meta">{rows.length}</div>
                  </div>
                  <div className="board-col-body">
                    {rows.length === 0 ? <p className="board-empty">Drop here</p> : null}
                    {rows.map((item) => {
                      const person = workspace.leads.find((lead) => lead.id === item.leadId);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          draggable
                          onDragStart={() => setDragging(item.id)}
                          onClick={() => {
                            setSelectedId(item.id);
                            if (item.leadId) setSelectedLeadId(item.leadId);
                          }}
                          className="board-card"
                        >
                          <div className="board-card-top">
                            <span className="az-chip">{item.stage}</span>
                            {person?.label ? <span className="az-chip">{person.label}</span> : null}
                          </div>
                          <div className="board-card-name">{item.property || item.name || person?.name}</div>
                          <div className="board-card-sub">
                            {[person?.name, person ? [person.city, person.state].filter(Boolean).join(", ") : ""].filter(Boolean).join(" · ") || "No location yet"}
                          </div>
                          <div className="board-card-foot">
                            <span>{person?.freightScore != null ? `Screen ${person.freightScore}` : "Unscored"}</span>
                            <span>{item.value ? `$${item.value}` : "Rate unset"}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="az-panel overflow-auto min-h-0 crm-table-wrap">
            <table className="az-table min-w-[920px]">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Label</th>
                  <th>Stage</th>
                  <th>Lane</th>
                  <th>Your rate</th>
                  <th>Next</th>
                </tr>
              </thead>
              <tbody>
                {workspace.opportunities.length === 0 ? (
                  <tr className="cursor-default">
                    <td colSpan={6} className="py-10 text-center text-[var(--muted)]">
                      No clients on the board yet.
                    </td>
                  </tr>
                ) : null}
                {workspace.opportunities.map((item) => {
                  const person = workspace.leads.find((lead) => lead.id === item.leadId);
                  return (
                    <tr key={item.id} onClick={() => setSelectedId(item.id)}>
                      <td>
                        <div className="font-medium">{item.property || item.name}</div>
                        <div className="text-[12px] text-[var(--muted)]">{item.name}</div>
                      </td>
                      <td>{person?.label || "—"}</td>
                      <td>
                        <select
                          className="az-select"
                          value={item.stage}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => moveDeal(item.id, event.target.value)}
                        >
                          {STAGES.map((stage) => (
                            <option key={stage}>{stage}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {item.origin || person?.origin || "—"} → {item.destination || person?.destination || "—"}
                      </td>
                      <td className="az-num">{item.value ? item.value : "—"}</td>
                      <td className="text-[12px] text-[var(--muted)]">{item.nextAction || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selected ? <DealDrawer opportunity={selected} onClose={() => setSelectedId(null)} /> : null}
      </div>
    </div>
  );
}

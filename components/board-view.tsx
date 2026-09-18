"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { phonePretty } from "@/lib/format";
import { deskColumn } from "@/lib/desk-rules";
import { workPath } from "@/lib/nav";
import { leadLocation } from "@/lib/freight";

export function BoardView() {
  const router = useRouter();
  const { workspace, loading, setSelectedLeadId } = useWorkspace();
  const [mode, setMode] = useState<"board" | "table">("board");

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading pipeline…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Pipeline</h1>
            <p>{workspace.leads.filter((lead) => !lead.archivedAt).length} on the book · Hunt → Talk → Quote → Cover. Cards move from Work outcomes.</p>
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
          workspace.leads.filter((lead) => !lead.archivedAt).length === 0 ? (
            <section className="empty-desk">
              <h2>Pipeline is empty</h2>
              <p>Capture a live listing. Cards appear from Work outcomes — Hunt, Talk, Quote, Cover.</p>
              <div className="empty-desk-actions">
                <button className="az-btn pri sm" type="button" onClick={() => router.push("/discover")}>
                  Hunt a listing
                </button>
              </div>
            </section>
          ) : (
          <div className="board pipeline-board">
            {(["hunt", "talk", "quote", "cover"] as const).map((id) => {
              const rows = workspace.leads.filter((lead) => !lead.archivedAt && deskColumn(lead, workspace) === id);
              return (
                <section key={id} className="board-col">
                  <div className="board-col-head">
                    <div className="board-col-title">{id === "hunt" ? "Hunt" : id === "talk" ? "Talk" : id === "quote" ? "Quote" : "Cover"}</div>
                    <div className="board-col-meta">{rows.length}</div>
                  </div>
                  <div className="board-col-body">
                    {rows.length === 0 ? <p className="board-empty">None yet</p> : null}
                    {rows.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => {
                          setSelectedLeadId(person.id);
                          router.push(workPath(person.id));
                        }}
                        className="board-card"
                      >
                        <div className="board-card-top">
                          {person.label ? <span className="az-chip">{person.label}</span> : <span className="az-chip">Unlabeled</span>}
                        </div>
                        <div className="board-card-name">{person.name}</div>
                        <div className="board-card-sub">{leadLocation(person) || "Texas"} · {person.phone ? phonePretty(person.phone) : "no phone"}</div>
                        <div className="board-card-sub">{person.nextAction || (person.attempts ? `${person.attempts} tries` : "Never tried")}</div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          )
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
                {workspace.leads.filter((lead) => !lead.archivedAt).length === 0 ? (
                  <tr className="cursor-default">
                    <td colSpan={6} className="py-10 text-center text-[var(--muted)]">
                      No clients on the board yet. Hunt a listing.
                    </td>
                  </tr>
                ) : null}
                {workspace.leads.filter((lead) => !lead.archivedAt).map((person) => (
                    <tr key={person.id} onClick={() => { setSelectedLeadId(person.id); router.push(workPath(person.id)); }}>
                      <td>
                        <div className="font-medium">{person.name}</div>
                      </td>
                      <td>{person.label || "—"}</td>
                      <td>{deskColumn(person, workspace)}</td>
                      <td>
                        {person.origin || "—"} → {person.destination || "—"}
                      </td>
                      <td className="az-num">—</td>
                      <td className="text-[12px] text-[var(--muted)]">{person.nextAction || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

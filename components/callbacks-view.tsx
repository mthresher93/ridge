"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { nowIso, relativeDue, uid } from "@/lib/format";
import type { CallbackType } from "@/lib/types";
import { Station } from "./page-intro";

const TYPES: CallbackType[] = ["hot", "promising", "standard", "confirmation"];

export function CallbacksView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const [filter, setFilter] = useState<"open" | "overdue" | "done">("open");
  const now = Date.now();

  const rows = useMemo(() => {
    return workspace.callbacks
      .filter((item) => {
        if (filter === "done") return item.status === "completed";
        if (filter === "overdue") return item.status === "open" && Date.parse(item.dueAt) < now;
        return item.status === "open";
      })
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  }, [workspace.callbacks, filter, now]);

  function complete(id: string) {
    setWorkspace((prev) => ({
      ...prev,
      callbacks: prev.callbacks.map((item) => (item.id === id ? { ...item, status: "completed", completedAt: nowIso() } : item)),
      updatedAt: nowIso(),
    }));
    log("callback", id, "completed", "Completed from Callbacks");
  }

  function add() {
    const lead = workspace.leads[0];
    if (!lead) return;
    const id = uid("cb");
    setWorkspace((prev) => ({
      ...prev,
      callbacks: [
        {
          id,
          leadId: lead.id,
          type: "standard",
          dueAt: new Date(Date.now() + 3600000).toISOString(),
          reason: "Manual follow-up",
          assignedUser: prev.settings.operator,
          notes: "",
          status: "open",
          createdAt: nowIso(),
        },
        ...prev.callbacks,
      ],
      updatedAt: nowIso(),
    }));
  }

  function setType(id: string, type: CallbackType) {
    setWorkspace((prev) => ({
      ...prev,
      callbacks: prev.callbacks.map((item) => (item.id === id ? { ...item, type } : item)),
      updatedAt: nowIso(),
    }));
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading callbacks…</div>;

  return (
    <Station
      n="04"
      title="Follow-up"
      lede={
        <>
          Due follow-ups only. Complete, call, or reschedule.
        </>
      }
      chip={`${rows.length} ${filter.toUpperCase()}`}
      actions={
        <button className="az-btn pri sm" type="button" onClick={add}>
          + Follow-up
        </button>
      }
    >
      <div className="work-tabs">
        {(["open", "overdue", "done"] as const).map((item) => (
          <button key={item} type="button" className={`az-btn sm ${filter === item ? "pri" : ""}`} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      <section className="cd-glass">
        {rows.length === 0 ? <p className="cd-mono" style={{ padding: 18 }}>Nothing in this slice.</p> : null}
        {rows.map((item) => {
          const lead = workspace.leads.find((row) => row.id === item.leadId);
          const late = item.status === "open" && Date.parse(item.dueAt) < now;
          return (
            <div key={item.id} className="work-row">
              <div>
                <b>{lead?.name || "Unlinked"}</b>
                <div className="cd-mono">
                  {item.reason} · {lead?.city || "—"}
                </div>
              </div>
              <select className="az-select" value={item.type} onChange={(e) => setType(item.id, e.target.value as CallbackType)}>
                {TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <span className={`cd-chip ${late ? "cr" : "inf"}`}>{relativeDue(item.dueAt)}</span>
              <div className="work-actions">
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
                {item.status === "open" ? (
                  <button className="az-btn sm" type="button" onClick={() => complete(item.id)}>
                    Done
                  </button>
                ) : (
                  <span className="cd-chip ok">done</span>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </Station>
  );
}

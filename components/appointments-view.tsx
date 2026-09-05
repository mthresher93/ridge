"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { formatWhen, nowIso } from "@/lib/format";
import { Station } from "./page-intro";

const STATUSES = ["scheduled", "confirmed", "completed", "no-show", "cancelled"];

export function AppointmentsView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const [filter, setFilter] = useState("live");

  const rows = useMemo(() => {
    return workspace.appointments
      .filter((item) => {
        if (filter === "live") return !["cancelled", "completed", "no-show"].includes(item.status);
        return item.status === filter;
      })
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }, [workspace.appointments, filter]);

  function setStatus(id: string, status: string) {
    setWorkspace((prev) => ({
      ...prev,
      appointments: prev.appointments.map((item) => (item.id === id ? { ...item, status } : item)),
      updatedAt: nowIso(),
    }));
    log("appointment", id, "status", status);
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading sits…</div>;

  return (
    <Station
      n="05"
      title="Appointments"
      lede={
        <>
          Sits on the book. <em>Confirm, prep, or kill the time.</em> Current does not invent a close rate from a calendar.
        </>
      }
      chip={`${rows.length} SHOWN`}
      actions={
        <button className="az-btn pri sm" type="button" onClick={() => router.push("/studio")}>
          Sit prep
        </button>
      }
    >
      <div className="work-tabs">
        {["live", "scheduled", "confirmed", "completed", "no-show"].map((item) => (
          <button key={item} type="button" className={`az-btn sm ${filter === item ? "pri" : ""}`} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      <section className="cd-glass">
        {rows.length === 0 ? <p className="cd-mono" style={{ padding: 18 }}>No sits in this slice.</p> : null}
        {rows.map((item) => {
          const lead = workspace.leads.find((row) => row.id === item.leadId);
          return (
            <div key={item.id} className="work-row">
              <div>
                <b>{lead?.name || "Unlinked sit"}</b>
                <div className="cd-mono">
                  {item.type} · {item.location || lead?.property || "—"} · {item.closer} closer
                </div>
              </div>
              <span className="cd-chip inf">{formatWhen(item.startsAt)}</span>
              <select className="az-select" value={item.status} onChange={(e) => setStatus(item.id, e.target.value)}>
                {STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <div className="work-actions">
                <button
                  className="az-btn sm pri"
                  type="button"
                  onClick={() => {
                    setSelectedLeadId(item.leadId);
                    router.push("/floor");
                  }}
                >
                  Prep
                </button>
                <button
                  className="az-btn sm"
                  type="button"
                  onClick={() => {
                    setSelectedLeadId(item.leadId);
                    router.push("/design");
                  }}
                >
                  Roof
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </Station>
  );
}

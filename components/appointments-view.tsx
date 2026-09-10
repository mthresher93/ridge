"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { formatWhen, nowIso, uid } from "@/lib/format";
import { isLiveLead } from "@/lib/contacts";

const STATUSES = ["scheduled", "confirmed", "completed", "no-show", "cancelled"];

export function AppointmentsView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const [filter, setFilter] = useState("live");
  const [creating, setCreating] = useState(false);

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

  function createSit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const leadId = String(data.get("leadId") || "");
    const startsAt = String(data.get("startsAt") || "");
    if (!leadId || !startsAt) return;
    const id = uid("apt");
    setWorkspace((prev) => ({
      ...prev,
      appointments: [
        {
          id,
          leadId,
          type: String(data.get("type") || "Consultation"),
          startsAt: new Date(startsAt).toISOString(),
          duration: Number(data.get("duration")) || 60,
          setter: prev.settings.operator || prev.settings.defaultOwner,
          closer: String(data.get("closer") || prev.settings.defaultOwner),
          location: String(data.get("location") || ""),
          status: "scheduled",
          notes: "",
          createdAt: nowIso(),
        },
        ...prev.appointments,
      ],
      updatedAt: nowIso(),
    }));
    log("appointment", id, "created", "Sit booked from Appointments");
    setCreating(false);
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading sits…</div>;

  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>Appointments</h1>
          <p>{rows.length} shown</p>
        </div>
        <div className="rec-head-actions">
          <button className="az-btn sm" type="button" onClick={() => router.push("/studio")}>
            Sit prep
          </button>
          <button className="az-btn pri sm" type="button" onClick={() => setCreating((value) => !value)}>
            {creating ? "Cancel" : "Book sit"}
          </button>
        </div>
      </header>
      <div className="desk-body">
      {creating ? (
        <form className="sit-form" onSubmit={createSit}>
          <label>
            Household
            <select className="az-select" name="leadId" required defaultValue="">
              <option value="" disabled>
                Select contact
              </option>
              {workspace.leads.filter(isLiveLead).map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name} · {lead.city || "no city"}
                </option>
              ))}
            </select>
          </label>
          <label>
            When
            <input className="az-input" name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Type
            <input className="az-input" name="type" defaultValue="Consultation" />
          </label>
          <label>
            Minutes
            <input className="az-input" name="duration" type="number" min={15} step={15} defaultValue={60} />
          </label>
          <label>
            Closer
            <input className="az-input" name="closer" defaultValue={workspace.settings.defaultOwner} />
          </label>
          <label>
            Location
            <input className="az-input" name="location" placeholder="Address or Zoom" />
          </label>
          <button className="az-btn pri sm" type="submit">
            Save sit
          </button>
        </form>
      ) : null}
      <div className="work-tabs">
        {["live", "scheduled", "confirmed", "completed", "no-show"].map((item) => (
          <button key={item} type="button" className={`az-btn sm ${filter === item ? "pri" : ""}`} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      <section className="desk-list">
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
      </div>
    </div>
  );
}

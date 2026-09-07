"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { generateFollowUp, companyName } from "@/lib/freight";
import { nowIso, relativeDue, uid } from "@/lib/format";
import type { CallbackType } from "@/lib/types";

const TYPES: CallbackType[] = ["hot", "promising", "standard", "confirmation"];
const SNOOZE = [
  { id: "today", label: "Today", days: 0 },
  { id: "tomorrow", label: "Tomorrow", days: 1 },
  { id: "3", label: "3 days", days: 3 },
  { id: "week", label: "Next week", days: 7 },
];

export function CallbacksView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const [filter, setFilter] = useState<"today" | "overdue" | "open" | "done">("today");
  const [leadId, setLeadId] = useState(workspace.leads[0]?.id || "");
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState("tomorrow");
  const [custom, setCustom] = useState("");
  const now = Date.now();

  const rows = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = start.getTime() + 86400000;
    return workspace.callbacks
      .filter((item) => {
        const due = Date.parse(item.dueAt);
        if (filter === "done") return item.status === "completed";
        if (filter === "overdue") return item.status === "open" && due < now;
        if (filter === "today") return item.status === "open" && due >= start.getTime() && due < end;
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
    log("callback", id, "completed", "Completed from Follow-ups");
  }

  function dueFrom(choice: string, customDate: string) {
    if (choice === "custom" && customDate) return new Date(`${customDate}T09:00:00`).toISOString();
    const days = SNOOZE.find((item) => item.id === choice)?.days ?? 1;
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(9, 0, 0, 0);
    return date.toISOString();
  }

  function add(event: React.FormEvent) {
    event.preventDefault();
    if (!leadId) return;
    const id = uid("cb");
    const dueAt = dueFrom(when, custom);
    setWorkspace((prev) => ({
      ...prev,
      callbacks: [
        {
          id,
          leadId,
          type: "standard",
          dueAt,
          reason: reason || "Follow up",
          assignedUser: prev.settings.operator,
          notes: "",
          status: "open",
          createdAt: nowIso(),
        },
        ...prev.callbacks,
      ],
      leads: prev.leads.map((item) => (item.id === leadId ? { ...item, nextFollowUp: dueAt, nextAction: reason || item.nextAction, updatedAt: nowIso() } : item)),
      updatedAt: nowIso(),
    }));
    setReason("");
  }

  function snooze(id: string, days: number) {
    const dueAt = dueFrom(days === 0 ? "today" : days === 1 ? "tomorrow" : days === 3 ? "3" : "week", "");
    setWorkspace((prev) => ({
      ...prev,
      callbacks: prev.callbacks.map((item) => (item.id === id ? { ...item, dueAt } : item)),
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

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading follow-ups…</div>;

  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>Follow-ups</h1>
          <p>{rows.length} in this slice · every open item has a reason and a next date</p>
        </div>
      </header>
      <div className="desk-body">
        <form className="follow-add" onSubmit={add}>
          {workspace.leads.filter((item) => !item.archivedAt).length === 0 ? (
            <p className="rec-empty">No clients yet. Capture one, then schedule a follow-up.</p>
          ) : (
            <>
          <select className="az-select" value={leadId} onChange={(event) => setLeadId(event.target.value)}>
            {workspace.leads.filter((item) => !item.archivedAt).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input className="az-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Asked me to check back Monday" />
          <select className="az-select" value={when} onChange={(event) => setWhen(event.target.value)}>
            {SNOOZE.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
            <option value="custom">Custom date</option>
          </select>
          {when === "custom" ? <input className="az-input" type="date" value={custom} onChange={(event) => setCustom(event.target.value)} /> : null}
          <button className="az-btn pri sm" type="submit">
            Schedule
          </button>
            </>
          )}
        </form>
        <div className="work-tabs">
          {(["today", "overdue", "open", "done"] as const).map((item) => (
            <button key={item} type="button" className={`az-btn sm ${filter === item ? "pri" : ""}`} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
        <section className="desk-list">
          {rows.length === 0 ? <p className="cd-mono" style={{ padding: 18 }}>Nothing in this slice.</p> : null}
          {rows.map((item) => {
            const lead = workspace.leads.find((row) => row.id === item.leadId);
            const late = item.status === "open" && Date.parse(item.dueAt) < now;
            const suggested = lead ? generateFollowUp(lead, item.reason) : "";
            return (
              <div key={item.id} className="work-row follow-row">
                <div>
                  <b>{lead?.name || "Unlinked"}</b>
                  <div className="cd-mono">
                    {lead ? `${companyName(lead)} · ${lead.equipmentType || lead.listingTitle || lead.source}` : "Unlinked"}
                  </div>
                  <p>{item.reason}</p>
                  {suggested ? <p className="cd-mono">{suggested}</p> : null}
                </div>
                <div className="freight-row-actions">
                  <select className="az-select" value={item.type} onChange={(event) => setType(item.id, event.target.value as CallbackType)}>
                    {TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <span className={late ? "bad" : ""}>{relativeDue(item.dueAt)}</span>
                  {SNOOZE.map((slot) => (
                    <button key={slot.id} className="az-btn sm" type="button" onClick={() => snooze(item.id, slot.days)}>
                      {slot.label}
                    </button>
                  ))}
                  <button
                    className="az-btn sm pri"
                    type="button"
                    onClick={() => {
                      if (suggested) navigator.clipboard.writeText(suggested);
                      setSelectedLeadId(item.leadId);
                      router.push("/outreach");
                    }}
                  >
                    Copy + outreach
                  </button>
                  {item.status === "open" ? (
                    <button className="az-btn sm" type="button" onClick={() => complete(item.id)}>
                      Done
                    </button>
                  ) : (
                    <span className="az-chip">done</span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

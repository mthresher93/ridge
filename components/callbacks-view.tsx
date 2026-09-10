"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { generateFollowUp, companyName } from "@/lib/freight";
import { workPath } from "@/lib/nav";
import { daysBetween, nowIso, relativeDue, uid } from "@/lib/format";
import { browserTelephony } from "@/lib/telephony";
import type { Callback, CallbackType, Lead } from "@/lib/types";

const TYPES: CallbackType[] = ["hot", "promising", "standard", "confirmation"];
const SNOOZE = [
  { id: "today", label: "Today", days: 0 },
  { id: "tomorrow", label: "Tomorrow", days: 1 },
  { id: "3", label: "3 days", days: 3 },
  { id: "week", label: "Next week", days: 7 },
];

const BUCKETS = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "next3", label: "Next 3 days" },
  { id: "week", label: "Next week" },
  { id: "later", label: "Later" },
  { id: "done", label: "Completed" },
] as const;

type BucketId = (typeof BUCKETS)[number]["id"] | "all";

function startOfDay(offset = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.getTime();
}

function bucketOf(item: Callback, now: number): (typeof BUCKETS)[number]["id"] {
  if (item.status === "completed") return "done";
  const due = Date.parse(item.dueAt);
  if (due < now) return "overdue";
  if (due < startOfDay(1)) return "today";
  if (due < startOfDay(2)) return "tomorrow";
  if (due < startOfDay(4)) return "next3";
  if (due < startOfDay(8)) return "week";
  return "later";
}

export function CallbacksView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const [filter, setFilter] = useState<BucketId>("all");
  const [leadId, setLeadId] = useState(workspace.leads[0]?.id || "");
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState("tomorrow");
  const [custom, setCustom] = useState("");
  const now = Date.now();

  const grouped = useMemo(() => {
    const bags = Object.fromEntries(BUCKETS.map((item) => [item.id, [] as Callback[]])) as Record<(typeof BUCKETS)[number]["id"], Callback[]>;
    for (const item of workspace.callbacks) {
      bags[bucketOf(item, now)].push(item);
    }
    for (const key of Object.keys(bags) as (typeof BUCKETS)[number]["id"][]) {
      bags[key].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    }
    return bags;
  }, [workspace.callbacks, now]);

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

  function openLead(lead: Lead | undefined) {
    if (!lead) return;
    setSelectedLeadId(lead.id);
    router.push(workPath(lead.id));
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading follow-ups…</div>;

  const visible = filter === "all" ? BUCKETS.filter((item) => item.id !== "done") : BUCKETS.filter((item) => item.id === filter);
  const openCount = workspace.callbacks.filter((item) => item.status === "open").length;

  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>Follow-ups</h1>
          <p>{grouped.overdue.length} overdue · {grouped.today.length} today · {openCount} open</p>
        </div>
      </header>
      <div className="desk-body">
        <form className="follow-add" onSubmit={add}>
          {workspace.leads.filter((item) => !item.archivedAt).length === 0 ? (
            <div className="empty-desk" style={{ padding: 18 }}>
              <h2>No follow-ups until you have a client</h2>
              <p>Capture a listing, send a message, then schedule the next touch. Haul will not invent a callback.</p>
              <div className="empty-desk-actions">
                <button className="az-btn pri sm" type="button" onClick={() => router.push("/discover")}>
                  Discover
                </button>
                <button className="az-btn sm" type="button" onClick={() => router.push("/")}>
                  Desk
                </button>
              </div>
            </div>
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
        <div className="work-tabs wrap">
          <button type="button" className={`az-btn sm ${filter === "all" ? "pri" : ""}`} onClick={() => setFilter("all")}>
            All open
          </button>
          {BUCKETS.map((item) => (
            <button key={item.id} type="button" className={`az-btn sm ${filter === item.id ? "pri" : ""}`} onClick={() => setFilter(item.id)}>
              {item.label} {grouped[item.id].length}
            </button>
          ))}
        </div>
        <div className="follow-buckets">
          {visible.map((bucket) => {
            const rows = grouped[bucket.id];
            if (filter === "all" && rows.length === 0 && bucket.id !== "overdue" && bucket.id !== "today") return null;
            return (
              <section key={bucket.id} className={`follow-bucket ${bucket.id}`}>
                <h2>
                  {bucket.label} · {rows.length}
                </h2>
                <div className="desk-list">
                  {rows.length === 0 ? <p className="cd-mono" style={{ padding: 18 }}>Nothing in this slice.</p> : null}
                  {rows.map((item) => {
                    const lead = workspace.leads.find((row) => row.id === item.leadId);
                    const late = item.status === "open" && Date.parse(item.dueAt) < now;
                    const suggested = lead ? generateFollowUp(lead, item.reason) : "";
                    const opp = workspace.opportunities.find((row) => row.leadId === item.leadId);
                    return (
                      <div key={item.id} className="work-row follow-row">
                        <div>
                          <b>{lead?.name || "Unlinked"}</b>
                          <div className="follow-meta">
                            <span>{lead ? companyName(lead) : "Unlinked"}</span>
                            <span>{lead?.booker || lead?.homeowner || "No named contact"}</span>
                            <span>{lead?.source || "—"}</span>
                            <span>{opp?.stage || lead?.status || "—"}</span>
                            <span className={late ? "bad" : ""}>{relativeDue(item.dueAt)}</span>
                          </div>
                          <p>{item.reason}</p>
                          <p className="cd-mono">{lead?.nextAction || suggested || "No next action yet"}</p>
                          {lead?.lastContactAt ? <p className="cd-mono">Last touch {daysBetween(lead.lastContactAt)}d ago</p> : <p className="cd-mono">No last touch logged</p>}
                        </div>
                        <div className="freight-row-actions">
                          <select className="az-select" value={item.type} onChange={(event) => setType(item.id, event.target.value as CallbackType)}>
                            {TYPES.map((type) => (
                              <option key={type}>{type}</option>
                            ))}
                          </select>
                          {lead?.phone ? (
                            <button className="az-btn sm pri" type="button" onClick={() => browserTelephony().startCall(lead.phone)}>
                              Call
                            </button>
                          ) : null}
                          <button className="az-btn sm" type="button" onClick={() => { if (suggested) navigator.clipboard.writeText(suggested); }}>
                            Message
                          </button>
                          <button className="az-btn sm" type="button" onClick={() => openLead(lead)}>
                            Open prospect
                          </button>
                          {SNOOZE.map((slot) => (
                            <button key={slot.id} className="az-btn sm" type="button" onClick={() => snooze(item.id, slot.days)}>
                              {slot.label}
                            </button>
                          ))}
                          {item.status === "open" ? (
                            <button className="az-btn sm" type="button" onClick={() => complete(item.id)}>
                              Complete
                            </button>
                          ) : (
                            <span className="az-chip">done</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

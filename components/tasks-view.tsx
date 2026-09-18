"use client";

import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { relativeToNow } from "@/lib/clock";
import { nowIso } from "@/lib/clock";
import { workPath } from "@/lib/nav";
import { RecordsPage } from "./crm/records-page";

export function TasksView() {
  const router = useRouter();
  const { workspace, loading, setWorkspace, setSelectedLeadId } = useWorkspace();
  const open = workspace.callbacks.filter((item) => item.status === "open");

  if (loading) return <div className="cd-body text-[var(--vx-text-3)]">Loading tasks…</div>;

  return (
    <RecordsPage
      title="Tasks"
      subtitle="Follow-ups for named humans. A task without a person is not a task."
      columns={["Person", "Reason", "Due", "Owner", ""]}
      empty="Nothing open. Log a follow-up from a live call."
      primary={
        <button className="az-btn pri sm" type="button" onClick={() => router.push("/calls")}>
          + New task
        </button>
      }
      rows={open.map((item) => {
        const lead = workspace.leads.find((row) => row.id === item.leadId);
        return {
          id: item.id,
          onOpen: () => {
            setSelectedLeadId(item.leadId);
            router.push(workPath(item.leadId));
          },
          cells: [
            lead?.booker || lead?.name || "Unlinked",
            item.reason,
            <span key="d" className="tabular-nums">{relativeToNow(item.dueAt)}</span>,
            item.assignedUser || "Michael",
            <button
              key="done"
              className="az-btn sm"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setWorkspace((prev) => ({
                  ...prev,
                  callbacks: prev.callbacks.map((row) => (row.id === item.id ? { ...row, status: "completed", completedAt: nowIso() } : row)),
                  updatedAt: nowIso(),
                }));
              }}
            >
              Done
            </button>,
          ],
        };
      })}
    />
  );
}

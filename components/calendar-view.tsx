"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { formatWhen } from "@/lib/format";
import { userTimeZone } from "@/lib/clock";
import { workPath } from "@/lib/nav";
import { RecordsPage } from "./crm/records-page";

export function CalendarView() {
  const router = useRouter();
  const { workspace, loading, setSelectedLeadId } = useWorkspace();
  const rows = useMemo(
    () => [...workspace.appointments].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [workspace.appointments],
  );

  if (loading) return <div className="cd-body text-[var(--vx-text-3)]">Loading calendar…</div>;

  return (
    <RecordsPage
      title="Calendar"
      subtitle="Meetings and callbacks with a start time. Empty until you set one on a call."
      columns={["When", "Type", "Yard", "Owner", "Status"]}
      empty="No appointments on the book."
      primary={
        <button className="az-btn pri sm" type="button" onClick={() => router.push("/calls")}>
          + Add from a call
        </button>
      }
      rows={rows.map((item) => {
        const lead = workspace.leads.find((row) => row.id === item.leadId);
        return {
          id: item.id,
          onOpen: () => {
            setSelectedLeadId(item.leadId);
            router.push(workPath(item.leadId));
          },
          cells: [
            <span key="w" className="tabular-nums">{formatWhen(item.startsAt, userTimeZone())}</span>,
            item.type || "Call",
            lead?.name || "—",
            item.closer || item.setter || "Michael",
            item.status || "Open",
          ],
        };
      })}
    />
  );
}

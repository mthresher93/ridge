"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { formatWhen } from "@/lib/format";
import { userTimeZone } from "@/lib/clock";
import { workPath } from "@/lib/nav";
import { RecordsPage } from "./crm/records-page";

export function CallLogsView() {
  const router = useRouter();
  const { workspace, loading, setSelectedLeadId } = useWorkspace();
  const rows = useMemo(
    () => [...(workspace.callLogs || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    [workspace.callLogs],
  );

  if (loading) return <div className="cd-body text-[var(--vx-text-3)]">Loading call logs…</div>;

  return (
    <RecordsPage
      title="Call logs"
      subtitle="Outcomes you logged. This is not a connected dialer."
      columns={["When", "Yard", "Outcome", "Duration", "Notes"]}
      empty="No call logs yet. Log Talked / Voicemail / No pickup on Calls."
      primary={
        <button className="az-btn pri sm" type="button" onClick={() => router.push("/calls")}>
          Open Calls
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
            <span key="w" className="tabular-nums">{formatWhen(item.at, userTimeZone())}</span>,
            lead?.name || item.leadId,
            item.outcome || "—",
            <span key="d" className="tabular-nums">{item.duration ? `${item.duration}s` : "—"}</span>,
            item.notes || "—",
          ],
        };
      })}
    />
  );
}

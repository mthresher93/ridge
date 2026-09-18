"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { phonePretty } from "@/lib/format";
import { workPath } from "@/lib/nav";
import { RecordsPage } from "./crm/records-page";

export function ContactsView() {
  const router = useRouter();
  const { workspace, loading, setSelectedLeadId } = useWorkspace();

  const rows = useMemo(() => {
    const fromBook = workspace.contacts.map((person) => {
      const lead = workspace.leads.find((item) => item.id === person.leadId);
      return {
        id: person.id,
        leadId: person.leadId,
        name: person.name,
        role: person.role || "Contact",
        phone: person.phone,
        yard: lead?.name || "—",
      };
    });
    const fromLeads = workspace.leads
      .filter((lead) => !lead.archivedAt && lead.booker)
      .filter((lead) => !fromBook.some((row) => row.leadId === lead.id && row.name === lead.booker))
      .map((lead) => ({
        id: `booker-${lead.id}`,
        leadId: lead.id,
        name: lead.booker || "",
        role: "Booker",
        phone: lead.bookerPhone || lead.phone,
        yard: lead.name,
      }));
    return [...fromBook, ...fromLeads];
  }, [workspace]);

  if (loading) return <div className="cd-body text-[var(--vx-text-3)]">Loading contacts…</div>;

  return (
    <RecordsPage
      title="Contacts"
      subtitle="Named humans only. Bookers live here after a real conversation."
      columns={["Name", "Role", "Yard", "Phone"]}
      empty="No named contacts yet. Call a yard from Calls and write the booker name."
      primary={
        <button className="az-btn pri sm" type="button" onClick={() => router.push("/calls")}>
          + New contact
        </button>
      }
      rows={rows.map((row) => ({
        id: row.id,
        onOpen: () => {
          setSelectedLeadId(row.leadId);
          router.push(workPath(row.leadId));
        },
        cells: [row.name, row.role, row.yard, <span key="p" className="tabular-nums">{row.phone ? phonePretty(row.phone) : "—"}</span>],
      }))}
    />
  );
}

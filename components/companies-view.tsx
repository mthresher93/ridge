"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { phonePretty } from "@/lib/format";
import { RecordsPage } from "./crm/records-page";

export function CompaniesView() {
  const router = useRouter();
  const { workspace, loading, setSelectedLeadId } = useWorkspace();

  const rows = useMemo(() => {
    const fromFile = workspace.companies.map((company) => ({
      id: company.id,
      name: company.name,
      city: [company.city, company.state].filter(Boolean).join(", "),
      phone: company.phone,
      leadId: workspace.leads.find((lead) => lead.companyId === company.id || lead.company === company.name)?.id,
    }));
    const extra = workspace.leads
      .filter((lead) => !lead.archivedAt)
      .filter((lead) => !fromFile.some((row) => row.name === lead.name || row.name === lead.company))
      .map((lead) => ({
        id: lead.id,
        name: lead.company || lead.name,
        city: [lead.city, lead.state].filter(Boolean).join(", "),
        phone: lead.phone,
        leadId: lead.id,
      }));
    return [...fromFile, ...extra];
  }, [workspace]);

  if (loading) return <div className="cd-body text-[var(--vx-text-3)]">Loading companies…</div>;

  return (
    <RecordsPage
      title="Companies"
      subtitle="Yards and shippers on the book. A company is a place with a published phone."
      columns={["Company", "City", "Phone"]}
      empty="No companies yet. Paste a published phone in Discover."
      primary={
        <button className="az-btn pri sm" type="button" onClick={() => router.push("/discover")}>
          + Add company
        </button>
      }
      rows={rows.map((row) => ({
        id: row.id,
        onOpen: () => {
          if (!row.leadId) return;
          setSelectedLeadId(row.leadId);
          router.push(`/leads?id=${encodeURIComponent(row.leadId)}`);
        },
        cells: [row.name, row.city || "Texas", <span key="p" className="tabular-nums">{row.phone ? phonePretty(row.phone) : "—"}</span>],
      }))}
    />
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { STAGES } from "@/lib/stages";
import { leadEligibility, leadScore, money, nowIso, phonePretty, uid } from "@/lib/format";
import { createLinkedOpportunity } from "@/lib/crm";
import { LeadDrawer } from "./lead-drawer";
import { PageDesk } from "./page-desk";
import type { Lead } from "@/lib/types";

export function PeopleView() {
  const searchParams = useSearchParams();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setSelectedId(id);
  }, [searchParams]);

  const leads = useMemo(() => {
    return workspace.leads.filter((lead) => {
      const hay = [lead.name, lead.property, lead.city, lead.phone, lead.email, lead.owner, lead.source].join(" ").toLowerCase();
      const matchQuery = !query || hay.includes(query.toLowerCase());
      const matchStatus = status === "all" || lead.status === status;
      return matchQuery && matchStatus;
    });
  }, [workspace.leads, query, status]);

  const selected = workspace.leads.find((lead) => lead.id === selectedId) || null;

  function addLead() {
    const id = uid("lead");
    const lead: Lead = {
      id,
      name: "New homeowner",
      property: "",
      phone: "",
      email: "",
      city: "",
      utility: "",
      monthlyBill: null,
      status: "New Lead",
      priority: "Medium",
      owner: workspace.settings.defaultOwner,
      source: "Manual",
      consent: "unknown",
      dnc: false,
      attempts: 0,
      nextAction: "Verify consent, then first dial",
      nextFollowUp: "",
      estimatedValue: 0,
      notes: "",
      homeowner: "Unknown",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    setWorkspace((prev) => {
      const withLead = { ...prev, leads: [lead, ...prev.leads], updatedAt: nowIso() };
      const opp = createLinkedOpportunity(withLead, id, lead.name, lead.property);
      return { ...withLead, opportunities: [opp, ...withLead.opportunities] };
    });
    log("lead", id, "created", "Lead + board deal created");
    setSelectedId(id);
    setSelectedLeadId(id);
  }

  if (loading) return <div className="text-[var(--muted)]">Loading contacts…</div>;

  return (
    <PageDesk>
    <div className="az-fill" style={{ gridTemplateRows: "auto auto minmax(0,1fr)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="az-title">Contacts</div>
        <button className="az-btn pri" onClick={addLead}>
          Add contact
        </button>
      </div>

      <div className="grid md:grid-cols-[1fr_200px_auto] gap-2 items-center">
        <input
          className="az-input"
          placeholder="Search name, property, city, phone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="az-select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All stages</option>
          {STAGES.map((stage) => (
            <option key={stage}>{stage}</option>
          ))}
        </select>
        <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-[var(--faint)]">{leads.length} shown</div>
      </div>

      <div className="az-panel overflow-auto min-h-0">
        <table className="az-table min-w-[980px]">
          <thead>
            <tr>
              <th>Contact</th>
              <th>Phone</th>
              <th>Stage</th>
              <th>Score</th>
              <th>Consent</th>
              <th>Bill</th>
              <th>Next</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr className="cursor-default">
                <td colSpan={8} className="py-10 text-center text-[var(--muted)]">
                  No contacts match.{" "}
                  <button type="button" className="text-[var(--gold-2)] underline" onClick={addLead}>
                    Add a contact
                  </button>
                </td>
              </tr>
            ) : null}
            {leads.map((lead) => {
              const eligibility = leadEligibility(lead);
              return (
                <tr
                  key={lead.id}
                  onClick={() => {
                    setSelectedId(lead.id);
                    setSelectedLeadId(lead.id);
                  }}
                >
                  <td>
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-[12px] text-[var(--muted)]">
                      {lead.property || "No property"} · {lead.city || "City unset"}
                    </div>
                  </td>
                  <td className="az-num">{phonePretty(lead.phone)}</td>
                  <td>
                    <span className="az-chip">{lead.status}</span>
                  </td>
                  <td className="az-num">{leadScore(lead)}</td>
                  <td>
                    <span className={`az-chip ${eligibility.tone}`}>{eligibility.label}</span>
                  </td>
                  <td className="az-num">{lead.monthlyBill ? money(lead.monthlyBill) : "—"}</td>
                  <td className="text-[12px] text-[var(--muted)] max-w-[220px]">
                    <div className="truncate">{lead.nextAction || "—"}</div>
                  </td>
                  <td className="az-num text-[var(--gold-2)]">{money(lead.estimatedValue)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected ? <LeadDrawer lead={selected} onClose={() => setSelectedId(null)} /> : null}
    </div>
    </PageDesk>
  );
}

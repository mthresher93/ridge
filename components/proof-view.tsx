"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { daysBetween, money } from "@/lib/format";

const CASES = [
  { kind: "Metric", who: "Fresno bungalow", result: "$268 → $41", note: "10.2 kW, 26 modules, 47 days to PTO", age: 34, confidence: "verified" },
  { kind: "Metric", who: "Henderson two-story", result: "Peak −62%", note: "West plane + 10 kWh. Same-night sit.", age: 61, confidence: "verified" },
  { kind: "Testimonial", who: "Sacramento ranch", result: "$198 flattened", note: "Co-signer delay. Still signed.", age: 88, confidence: "self-reported" },
  { kind: "Objection", who: "Roof-age hold", result: "Price the reroof as a line", note: "Do not hide deck work in the array price.", age: 12, confidence: "internal" },
];

export function ProofView() {
  const { workspace, loading } = useWorkspace();
  const [kind, setKind] = useState("all");
  const designs = Object.values(workspace.designs || {});
  const proposals = Object.values(workspace.proposals || {});

  const live = useMemo(
    () =>
      proposals.map((proposal) => {
        const lead = workspace.leads.find((item) => item.id === proposal.leadId);
        return {
          kind: "Proposal",
          who: proposal.customerName || lead?.name || "Unnamed",
          result: proposal.systemKw ? `${proposal.systemKw} kW · ${proposal.offset}% offset` : proposal.status,
          note: `${lead?.city || "City unset"} · ${proposal.source === "modules" ? "from placed modules" : "bill plan"}`,
          age: daysBetween(proposal.updatedAt),
          confidence: proposal.status === "sent" ? "customer-facing" : "internal draft",
        };
      }),
    [proposals, workspace.leads],
  );

  const rows = [...CASES, ...live].filter((item) => kind === "all" || item.kind === kind);
  const stale = rows.filter((item) => item.age > 90).length;
  const named = workspace.leads.filter((item) => item.notes).length;

  if (loading) return <div className="cd-body text-[var(--tx4)]">Reading proof…</div>;

  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>Proof</h1>
          <p>{rows.length} assets · {stale} stale</p>
        </div>
      </header>

      <div className="desk-body">
      <div className="proof-grid">
        <aside className="cd-glass proof-side">
          <div className="cd-mono">By type</div>
          {["all", "Metric", "Testimonial", "Objection", "Proposal"].map((item) => (
            <button key={item} type="button" className={`ps-item ${kind === item ? "on" : ""}`} onClick={() => setKind(item)}>
              {item === "all" ? "All proof" : item}
              <span>{item === "all" ? rows.length : [...CASES, ...live].filter((row) => row.kind === item).length}</span>
            </button>
          ))}
        </aside>
        <section className="cd-glass">
          <div className="cd-head">
            <h3>Most recent</h3>
            <span className="r">{stale} stale · {named} noted records</span>
          </div>
          <div className="proof-gaps">
            <b>Gaps that stall a sit</b>
            <p>Offers without a named bill-in / bill-out. Designs without a proposal snapshot. Objections older than 90 days.</p>
          </div>
          <div style={{ padding: "0 16px 8px" }}>
            {rows.map((item) => (
              <article key={`${item.who}-${item.result}`} className="proof-card">
                <div className="pc-h">
                  <span className="cd-chip">{item.kind} · {item.confidence}</span>
                  <span className={`cd-chip ${item.age > 90 ? "wn" : "ok"}`}>{item.age}d</span>
                </div>
                <div className="pc-text">{item.result}</div>
                <div className="cd-mono">{item.who}</div>
                <p>{item.note}</p>
              </article>
            ))}
            {rows.length === 0 ? <p className="cd-mono" style={{ padding: 16 }}>Nothing in this slice.</p> : null}
          </div>
        </section>
        <aside className="cd-glass" style={{ padding: 16 }}>
          <div className="cd-mono">Local provenance</div>
          <p style={{ margin: "10px 0 16px", color: "var(--tx2)", fontSize: 13 }}>
            Seed cases are labeled. Live rows come from saved proposals and notes — {money(workspace.leads.reduce((sum, lead) => sum + (lead.estimatedValue || 0), 0))} of estimated household value, not invented close rates.
          </p>
          {workspace.leads
            .filter((lead) => lead.notes)
            .slice(0, 6)
            .map((lead) => (
              <div key={lead.id} className="cd-row">
                <div>
                  <b>{lead.name}</b>
                  <div className="cd-mono">{lead.city}</div>
                </div>
                <span className="cd-chip inf">note</span>
              </div>
            ))}
        </aside>
      </div>
      </div>
    </div>
  );
}

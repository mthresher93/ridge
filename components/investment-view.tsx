"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { money } from "@/lib/format";
import { estimateFor } from "@/lib/solar";

export function InvestmentView() {
  const { workspace, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const [horizon, setHorizon] = useState(10);
  const lead = workspace.leads.find((item) => item.id === selectedLeadId) || workspace.leads[0] || null;
  const design = lead ? workspace.designs?.[lead.id] : null;
  const est = useMemo(() => (lead && design ? estimateFor(lead, design) : null), [lead, design]);
  const paper = est
    ? {
        outlay: est.netPrice,
        yearly: est.annualSavings,
        returned: est.annualSavings * horizon,
        leftover: est.annualSavings * horizon - est.netPrice,
        payback: est.payback,
      }
    : null;

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading paper desk…</div>;

  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>Investment</h1>
          <p>Paper economics from the saved roof model · not a live quote</p>
        </div>
      </header>
      <div className="desk-body">
      <div className="cd-grid" style={{ gridTemplateColumns: "280px minmax(0,1fr)" }}>
        <aside className="cd-glass" style={{ padding: 14 }}>
          <div className="cd-mono" style={{ marginBottom: 8 }}>
            Household
          </div>
          <select className="az-select" value={lead?.id || ""} onChange={(e) => setSelectedLeadId(e.target.value)}>
            {workspace.leads.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <label className="inv-label">
            Horizon years
            <input className="az-input" type="number" min={1} max={25} value={horizon} onChange={(e) => setHorizon(Number(e.target.value) || 1)} />
          </label>
          <p className="cd-mono" style={{ marginTop: 14, textTransform: "none", letterSpacing: 0 }}>
            Uses the saved design estimate. No roof, no payback.
          </p>
        </aside>
        <section className="cd-glass" style={{ padding: 20 }}>
          {!est || !paper || !lead ? (
            <p className="cd-mono">Select a lead with a roof model.</p>
          ) : (
            <>
              <div className="home-hero" style={{ gridColumn: "auto", minHeight: 0, marginBottom: 16 }}>
                <div>
                  <div className="lbl">Paper case</div>
                  <div className="hd">
                    {lead.name} · <em>{est.systemKw} kW</em>
                  </div>
                  <p>
                    {est.panelCount} modules · {est.offset}% offset · Year-1 savings {money(est.annualSavings)} against a{" "}
                    {lead.monthlyBill ? money(lead.monthlyBill) : "unknown"} bill.
                  </p>
                </div>
                <div className="hero-stat">
                  <div className="k">{money(paper.outlay)}</div>
                  <div className="l">net after ITC</div>
                </div>
              </div>
              <div className="metric-strip">
                <div className="ms-cell">
                  <div className="ms-l">Payback</div>
                  <div className="ms-v cy">{paper.payback ? `${paper.payback.toFixed(1)}y` : "—"}</div>
                  <div className="ms-d">if savings hold</div>
                </div>
                <div className="ms-cell">
                  <div className="ms-l">{horizon}y returned</div>
                  <div className="ms-v">{money(paper.returned)}</div>
                  <div className="ms-d">simple sum</div>
                </div>
                <div className="ms-cell">
                  <div className="ms-l">Leftover</div>
                  <div className="ms-v" style={{ color: paper.leftover >= 0 ? "var(--tl)" : "var(--rd)" }}>
                    {money(paper.leftover)}
                  </div>
                  <div className="ms-d">not discounted</div>
                </div>
                <div className="ms-cell">
                  <div className="ms-l">Loan</div>
                  <div className="ms-v">{money(est.monthlyPayment)}</div>
                  <div className="ms-d">planning payment</div>
                </div>
                <div className="ms-cell">
                  <div className="ms-l">Lease</div>
                  <div className="ms-v">{money(est.leaseMonthly)}</div>
                  <div className="ms-d">compare only</div>
                </div>
                <div className="ms-cell">
                  <div className="ms-l">Fit</div>
                  <div className="ms-v" style={{ color: "var(--vi)" }}>
                    {est.fit}
                  </div>
                  <div className="ms-d">{est.heading}</div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}

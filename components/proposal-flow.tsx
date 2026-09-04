"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import { compassLabel, type SolarEstimate } from "@/lib/solar";
import type { Lead, Proposal, RoofDesign } from "@/lib/types";

type Step = "review" | "pricing" | "proposal" | "present";

type LiveMetrics = {
  roofSqFt: number;
  panelCount: number;
  systemKw: number;
  coverage: number;
  panelSqFt?: number;
  usableSqFt?: number;
};

const STEPS: { id: Step; label: string }[] = [
  { id: "review", label: "Review" },
  { id: "pricing", label: "Pricing" },
  { id: "proposal", label: "Proposal" },
  { id: "present", label: "Present" },
];

export function ProposalFlow({
  lead,
  design,
  estimate,
  live,
  saved,
  onSave,
  onMarkPresented,
}: {
  lead: Lead;
  design: RoofDesign;
  estimate: SolarEstimate;
  live: LiveMetrics;
  saved?: Proposal | null;
  onSave: () => void;
  onMarkPresented: () => void;
}) {
  const [step, setStep] = useState<Step>("review");
  const fromModules = live.panelCount > 0;
  const systemKw = fromModules ? live.systemKw : estimate.systemKw;
  const panelCount = fromModules ? live.panelCount : estimate.panelCount;
  const frozen = Boolean(saved?.version && saved.systemKw != null);
  const view = useMemo(() => {
    if (frozen && saved) {
      return {
        customerName: saved.customerName || lead.name,
        property: saved.property || lead.property,
        utility: saved.utility || lead.utility,
        monthlyBill: saved.monthlyBill ?? lead.monthlyBill,
        panelWatts: saved.panelWatts ?? design.panelWatts,
        panelCount: saved.panelCount ?? panelCount,
        systemKw: saved.systemKw ?? systemKw,
        roofSqFt: saved.roofSqFt ?? live.roofSqFt,
        coverage: saved.coverage ?? live.coverage,
        offset: saved.offset ?? estimate.offset,
        annualProduction: saved.annualProduction ?? estimate.annualProduction,
        annualUse: saved.annualUse ?? estimate.annualUse,
        grossPrice: saved.grossPrice ?? estimate.grossPrice,
        incentive: saved.incentive ?? estimate.incentive,
        netPrice: saved.netPrice ?? estimate.netPrice,
        monthlyPayment: saved.monthlyPayment ?? estimate.monthlyPayment,
        annualSavings: saved.annualSavings ?? estimate.annualSavings,
        azimuthDeg: saved.azimuthDeg ?? design.azimuthDeg,
        tiltDeg: saved.tiltDeg ?? design.tiltDeg,
        roofMaterial: saved.roofMaterial || design.roofMaterial,
        shadeLoss: saved.shadeLoss ?? design.shadeLoss,
        source: saved.source || (fromModules ? "modules" : "bill-plan"),
        version: saved.version,
        status: saved.status,
        notes: saved.notes,
        updatedAt: saved.updatedAt,
      };
    }
    return {
      customerName: lead.name,
      property: lead.property,
      utility: lead.utility,
      monthlyBill: lead.monthlyBill,
      panelWatts: design.panelWatts,
      panelCount,
      systemKw,
      roofSqFt: live.roofSqFt,
      coverage: live.coverage,
      offset: estimate.offset,
      annualProduction: estimate.annualProduction,
      annualUse: estimate.annualUse,
      grossPrice: estimate.grossPrice,
      incentive: estimate.incentive,
      netPrice: estimate.netPrice,
      monthlyPayment: estimate.monthlyPayment,
      annualSavings: estimate.annualSavings,
      azimuthDeg: design.azimuthDeg,
      tiltDeg: design.tiltDeg,
      roofMaterial: design.roofMaterial,
      shadeLoss: design.shadeLoss,
      source: fromModules ? ("modules" as const) : ("bill-plan" as const),
      version: saved?.version || 0,
      status: saved?.status || "Draft",
      notes: saved?.notes || "",
      updatedAt: saved?.updatedAt || "",
    };
  }, [frozen, saved, lead, design, estimate, live, panelCount, systemKw, fromModules]);

  const stale =
    frozen &&
    saved &&
    ((fromModules && (saved.panelCount !== live.panelCount || saved.systemKw !== live.systemKw)) ||
      (!fromModules && saved.source === "modules") ||
      (fromModules && saved.source === "bill-plan"));

  function copySummary() {
    const text = [
      `Ridge proposal · ${view.customerName}`,
      view.property,
      `${view.systemKw} kW · ${view.panelCount} × ${view.panelWatts}W`,
      view.source === "modules" ? "Sized from placed modules" : "Planning size from utility bill",
      `Offset ${view.offset}% · Year-1 est. ${view.annualProduction.toLocaleString()} kWh`,
      `Cash ${money(view.netPrice)} after ITC · Loan ${money(view.monthlyPayment)}/mo`,
      view.notes,
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard?.writeText(text);
  }

  return (
    <div className="prop-flow">
      <div className="prop-steps" role="tablist" aria-label="Proposal steps">
        {STEPS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={step === item.id}
            className={step === item.id ? "on" : ""}
            onClick={() => setStep(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {stale ? (
        <p className="prop-caveat">Design changed since v{saved?.version}. Review live metrics above, then save a new proposal version.</p>
      ) : null}

      {step === "review" ? (
        <div className="prop-pane">
          <div className="prop-kicker">System review</div>
          <h3 className="prop-title">{view.customerName}</h3>
          <p className="prop-sub">{view.property || "Property unset"}</p>
          <dl className="prop-dl">
            <div>
              <dt>Array</dt>
              <dd>
                {view.systemKw} kW · {view.panelCount} modules · {view.panelWatts}W
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{view.source === "modules" ? "Placed modules on roof faces" : "Bill-based planning size — no modules placed"}</dd>
            </div>
            <div>
              <dt>Roof</dt>
              <dd>
                {view.roofSqFt} ft² · {view.roofMaterial} · {compassLabel(view.azimuthDeg)} {view.azimuthDeg}° · {view.tiltDeg}° pitch
              </dd>
            </div>
            {view.source === "modules" ? (
              <div>
                <dt>Coverage</dt>
                <dd>{view.coverage}% of drawn roof area</dd>
              </div>
            ) : null}
            <div>
              <dt>Utility</dt>
              <dd>
                {view.utility || "—"}
                {view.monthlyBill ? ` · $${view.monthlyBill}/mo` : ""}
                {view.annualUse ? ` · ~${view.annualUse.toLocaleString()} kWh/yr assumed` : ""}
              </dd>
            </div>
            <div>
              <dt>Year-1 production</dt>
              <dd>
                ~{view.annualProduction.toLocaleString()} kWh · {view.offset}% offset
                <span className="prop-caveat">Uses assumed shade ({view.shadeLoss}%) and city sun hours — not a shade study.</span>
              </dd>
            </div>
          </dl>
          {frozen ? <p className="prop-stamp">Showing saved proposal v{view.version}. Live design may differ.</p> : null}
          <button type="button" className="az-btn" onClick={() => setStep("pricing")}>
            Continue to pricing
          </button>
        </div>
      ) : null}

      {step === "pricing" ? (
        <div className="prop-pane">
          <div className="prop-kicker">Pricing & financing</div>
          <dl className="prop-dl">
            <div>
              <dt>Gross</dt>
              <dd>{money(view.grossPrice)}</dd>
            </div>
            <div>
              <dt>Federal ITC (30%)</dt>
              <dd>−{money(view.incentive)}</dd>
            </div>
            <div>
              <dt>Cash after ITC</dt>
              <dd className="prop-em">{money(view.netPrice)}</dd>
            </div>
            <div>
              <dt>Loan payment</dt>
              <dd>
                {money(view.monthlyPayment)}/mo
                <span className="prop-caveat">Illustrative 20-yr loan at the desk rate — not a lender quote.</span>
              </dd>
            </div>
            <div>
              <dt>Est. annual savings</dt>
              <dd>
                {money(view.annualSavings)}/yr
                <span className="prop-caveat">Based on assumed utility rate in the workspace model.</span>
              </dd>
            </div>
          </dl>
          <div className="prop-actions">
            <button type="button" className="az-btn" onClick={() => setStep("review")}>
              Back
            </button>
            <button type="button" className="az-btn pri" onClick={() => setStep("proposal")}>
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === "proposal" ? (
        <div className="prop-pane">
          <div className="prop-kicker">Proposal</div>
          <p className="prop-sub">
            {view.version ? `Saved v${view.version} · ${view.status}` : "Not saved yet — stamp a version from this design."}
          </p>
          <dl className="prop-dl compact">
            <div>
              <dt>System</dt>
              <dd>
                {view.systemKw} kW · {view.panelCount} modules
              </dd>
            </div>
            <div>
              <dt>Cash</dt>
              <dd>{money(view.netPrice)}</dd>
            </div>
            <div>
              <dt>Loan</dt>
              <dd>{money(view.monthlyPayment)}/mo</dd>
            </div>
            <div>
              <dt>Offset</dt>
              <dd>{view.offset}%</dd>
            </div>
          </dl>
          {view.notes ? <p className="prop-notes">{view.notes}</p> : null}
          <div className="prop-actions">
            <button type="button" className="az-btn pri" onClick={onSave}>
              Save proposal v{(saved?.version || 0) + 1}
            </button>
            <button type="button" className="az-btn" onClick={copySummary}>
              Copy summary
            </button>
            <button type="button" className="az-btn" onClick={() => setStep("present")} disabled={!saved?.version}>
              Present
            </button>
          </div>
          {!saved?.version ? <p className="prop-caveat">Save once before opening customer presentation.</p> : null}
        </div>
      ) : null}

      {step === "present" && saved?.version ? (
        <ProposalPresent
          view={view}
          onClose={() => setStep("proposal")}
          onMarkPresented={onMarkPresented}
        />
      ) : null}

      {step === "present" && !saved?.version ? (
        <div className="prop-pane">
          <p className="prop-caveat">Save a proposal version before presenting.</p>
          <button type="button" className="az-btn" onClick={() => setStep("proposal")}>
            Back to proposal
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ProposalPresent({
  view,
  onClose,
  onMarkPresented,
}: {
  view: {
    customerName: string;
    property: string;
    utility?: string;
    monthlyBill?: number | null;
    panelWatts: number;
    panelCount: number;
    systemKw: number;
    roofSqFt: number;
    offset: number;
    annualProduction: number;
    netPrice: number;
    monthlyPayment: number;
    annualSavings: number;
    azimuthDeg: number;
    tiltDeg: number;
    roofMaterial: string;
    shadeLoss: number;
    source: string;
    version: number;
    notes: string;
  };
  onClose: () => void;
  onMarkPresented: () => void;
}) {
  return (
    <div className="prop-present" role="dialog" aria-label="Customer proposal">
      <button type="button" className="prop-present-close" onClick={onClose}>
        Close
      </button>
      <article className="prop-sheet">
        <header className="prop-sheet-head">
          <div className="prop-sheet-brand">Ridge</div>
          <div className="prop-sheet-meta">Proposal v{view.version}</div>
        </header>
        <h1 className="prop-sheet-name">{view.customerName}</h1>
        <p className="prop-sheet-property">{view.property}</p>

        <section className="prop-sheet-hero">
          <div>
            <span>System size</span>
            <b>{view.systemKw} kW</b>
          </div>
          <div>
            <span>Modules</span>
            <b>
              {view.panelCount} × {view.panelWatts}W
            </b>
          </div>
          <div>
            <span>Offset</span>
            <b>{view.offset}%</b>
          </div>
        </section>

        <section className="prop-sheet-body">
          <div>
            <h2>Array</h2>
            <p>
              {view.roofMaterial} · {compassLabel(view.azimuthDeg)} {view.azimuthDeg}° · {view.tiltDeg}° pitch
              {view.roofSqFt ? ` · ${view.roofSqFt} ft² drawn roof` : ""}
            </p>
            <p className="prop-sheet-fine">
              {view.source === "modules"
                ? "Sized from modules placed on the design canvas."
                : "Planning size from monthly utility bill — modules not yet placed."}
            </p>
          </div>
          <div>
            <h2>Production</h2>
            <p>~{view.annualProduction.toLocaleString()} kWh year-1 estimate</p>
            <p className="prop-sheet-fine">Assumed shade loss {view.shadeLoss}% and regional sun hours. Not a shade study.</p>
          </div>
          <div>
            <h2>Investment</h2>
            <p>
              Cash {money(view.netPrice)} after estimated ITC · Loan from {money(view.monthlyPayment)}/mo
            </p>
            <p className="prop-sheet-fine">
              Est. {money(view.annualSavings)}/yr bill savings at the workspace rate model. Financing is illustrative.
            </p>
          </div>
          {view.utility || view.monthlyBill ? (
            <div>
              <h2>Utility</h2>
              <p>
                {view.utility || "Utility"}
                {view.monthlyBill ? ` · $${view.monthlyBill}/mo` : ""}
              </p>
            </div>
          ) : null}
          {view.notes ? (
            <div>
              <h2>Notes</h2>
              <p>{view.notes}</p>
            </div>
          ) : null}
        </section>

        <footer className="prop-sheet-foot">
          <button type="button" className="az-btn pri" onClick={onMarkPresented}>
            Mark presented
          </button>
          <button type="button" className="az-btn" onClick={onClose}>
            Back to design
          </button>
        </footer>
      </article>
    </div>
  );
}

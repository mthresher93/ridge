"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import { SOLAR_MODEL, compassLabel, type SolarEstimate } from "@/lib/solar";
import { moduleCorners } from "@/lib/site";
import type { Lead, PlacedModule, Proposal, RoofDesign } from "@/lib/types";

type Step = "review" | "pricing" | "proposal" | "present";

type LiveMetrics = {
  roofSqFt: number;
  panelCount: number;
  systemKw: number;
  coverage: number;
  panelSqFt?: number;
  usableSqFt?: number;
};

type View = {
  customerName: string;
  property: string;
  address: string;
  city: string;
  utility: string;
  monthlyBill: number | null;
  panelWatts: number;
  panelWidthIn: number;
  panelHeightIn: number;
  panelCount: number;
  systemKw: number;
  roofSqFt: number;
  usableSqFt: number;
  panelSqFt: number;
  coverage: number;
  setbackFt: number;
  faceCount: number;
  offset: number;
  annualProduction: number;
  annualUse: number;
  annualSunHours: number;
  grossPrice: number;
  incentive: number;
  netPrice: number;
  monthlyPayment: number;
  annualSavings: number;
  azimuthDeg: number;
  tiltDeg: number;
  roofMaterial: string;
  shadeLoss: number;
  source: "modules" | "bill-plan";
  version: number;
  status: string;
  notes: string;
  updatedAt: string;
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
  const address = lead.address || `${lead.property}, ${lead.city}`;

  const view = useMemo<View>(() => {
    const liveBits = {
      customerName: lead.name,
      property: lead.property,
      address,
      city: lead.city || "",
      utility: lead.utility || "",
      monthlyBill: lead.monthlyBill,
      panelWatts: design.panelWatts,
      panelWidthIn: design.panelWidthIn ?? 41,
      panelHeightIn: design.panelHeightIn ?? 74,
      panelCount,
      systemKw,
      roofSqFt: live.roofSqFt,
      usableSqFt: live.usableSqFt ?? 0,
      panelSqFt: live.panelSqFt ?? 0,
      coverage: live.coverage,
      setbackFt: design.setbackFt ?? 3,
      faceCount: (design.faces || []).length,
      offset: estimate.offset,
      annualProduction: estimate.annualProduction,
      annualUse: estimate.annualUse,
      annualSunHours: design.annualSunHours,
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
    if (frozen && saved) {
      return {
        ...liveBits,
        customerName: saved.customerName || liveBits.customerName,
        property: saved.property || liveBits.property,
        address: saved.address || liveBits.address,
        city: saved.city || liveBits.city,
        utility: saved.utility || liveBits.utility,
        monthlyBill: saved.monthlyBill ?? liveBits.monthlyBill,
        panelWatts: saved.panelWatts ?? liveBits.panelWatts,
        panelWidthIn: saved.panelWidthIn ?? liveBits.panelWidthIn,
        panelHeightIn: saved.panelHeightIn ?? liveBits.panelHeightIn,
        panelCount: saved.panelCount ?? liveBits.panelCount,
        systemKw: saved.systemKw ?? liveBits.systemKw,
        roofSqFt: saved.roofSqFt ?? liveBits.roofSqFt,
        usableSqFt: saved.usableSqFt ?? liveBits.usableSqFt,
        panelSqFt: saved.panelSqFt ?? liveBits.panelSqFt,
        coverage: saved.coverage ?? liveBits.coverage,
        setbackFt: saved.setbackFt ?? liveBits.setbackFt,
        faceCount: saved.faceCount ?? liveBits.faceCount,
        offset: saved.offset ?? liveBits.offset,
        annualProduction: saved.annualProduction ?? liveBits.annualProduction,
        annualUse: saved.annualUse ?? liveBits.annualUse,
        annualSunHours: saved.annualSunHours ?? liveBits.annualSunHours,
        grossPrice: saved.grossPrice ?? liveBits.grossPrice,
        incentive: saved.incentive ?? liveBits.incentive,
        netPrice: saved.netPrice ?? liveBits.netPrice,
        monthlyPayment: saved.monthlyPayment ?? liveBits.monthlyPayment,
        annualSavings: saved.annualSavings ?? liveBits.annualSavings,
        azimuthDeg: saved.azimuthDeg ?? liveBits.azimuthDeg,
        tiltDeg: saved.tiltDeg ?? liveBits.tiltDeg,
        roofMaterial: saved.roofMaterial || liveBits.roofMaterial,
        shadeLoss: saved.shadeLoss ?? liveBits.shadeLoss,
        source: saved.source || liveBits.source,
        version: saved.version,
        status: saved.status,
        notes: saved.notes,
        updatedAt: saved.updatedAt,
      };
    }
    return liveBits;
  }, [frozen, saved, lead, design, estimate, live, panelCount, systemKw, fromModules, address]);

  const stale =
    frozen &&
    saved &&
    ((fromModules && (saved.panelCount !== live.panelCount || saved.systemKw !== live.systemKw)) ||
      (!fromModules && saved.source === "modules") ||
      (fromModules && saved.source === "bill-plan"));

  function copySummary() {
    const text = [
      `Lumen proposal · ${view.customerName}`,
      view.address || view.property,
      view.source === "modules"
        ? `${view.systemKw} kW · ${view.panelCount} × ${view.panelWatts}W · ${view.panelWidthIn}×${view.panelHeightIn} in · surveyed array`
        : `${view.systemKw} kW planning size from utility bill · modules not placed`,
      view.roofSqFt ? `Roof ${view.roofSqFt} ft² · ${view.roofMaterial} · ${compassLabel(view.azimuthDeg)} ${view.azimuthDeg}° · ${view.tiltDeg}°` : "",
      `Workspace year-1 estimate ${view.annualProduction.toLocaleString()} kWh · ${view.offset}% offset`,
      `Cash ${money(view.netPrice)} after ${Math.round(SOLAR_MODEL.itc * 100)}% ITC · Loan ${money(view.monthlyPayment)}/mo`,
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
        <p className="prop-caveat">
          Design changed since v{saved?.version}. Live array is {live.systemKw} kW / {live.panelCount} modules. Save a new version to stamp it.
        </p>
      ) : null}

      {step === "review" ? (
        <div className="prop-pane">
          <div className="prop-kicker">System review</div>
          <h3 className="prop-title">{view.customerName}</h3>
          <p className="prop-sub">{view.address}</p>
          <ArrayThumb design={design} stamp={frozen ? saved?.arrayOutline : undefined} />
          <dl className="prop-dl">
            <div>
              <dt>Array</dt>
              <dd>
                {view.systemKw} kW · {view.panelCount} × {view.panelWatts}W
                <span className="prop-caveat">
                  {view.panelWidthIn}×{view.panelHeightIn} in modules
                  {fromModules && view.panelSqFt ? ` · ${view.panelSqFt} ft² panel area` : ""}
                </span>
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {fromModules
                  ? `Placed on ${view.faceCount || 1} surveyed roof face${view.faceCount === 1 ? "" : "s"}`
                  : "Bill-based planning size — no modules on the canvas"}
              </dd>
            </div>
            {view.roofSqFt ? (
              <div>
                <dt>Surveyed roof</dt>
                <dd>
                  {view.roofSqFt} ft² · {view.roofMaterial}
                  <span className="prop-caveat">
                    {compassLabel(view.azimuthDeg)} {view.azimuthDeg}° · {view.tiltDeg}° pitch
                    {view.usableSqFt ? ` · usable ${view.usableSqFt} ft² after ${view.setbackFt} ft setback` : ""}
                    {fromModules ? ` · ${view.coverage}% coverage` : ""}
                  </span>
                </dd>
              </div>
            ) : (
              <div>
                <dt>Roof</dt>
                <dd>
                  Not surveyed
                  <span className="prop-caveat">Draw a face on the canvas before treating roof area as measured.</span>
                </dd>
              </div>
            )}
            <div>
              <dt>Utility</dt>
              <dd>
                {view.utility || "—"}
                {view.monthlyBill ? ` · $${view.monthlyBill}/mo` : ""}
                {view.annualUse ? ` · ~${view.annualUse.toLocaleString()} kWh/yr from bill` : ""}
              </dd>
            </div>
            <div>
              <dt>Year-1 estimate</dt>
              <dd>
                ~{view.annualProduction.toLocaleString()} kWh · {view.offset}% offset
                <span className="prop-caveat">
                  {view.annualSunHours} city sun hours × (1 − {view.shadeLoss}% assumed shade) × {SOLAR_MODEL.inverterDerate} derate. Not a shade study or irradiance map.
                </span>
              </dd>
            </div>
          </dl>
          {frozen ? <p className="prop-stamp">Saved v{view.version} is frozen. Live design may differ until you save again.</p> : null}
          <button type="button" className="az-btn" onClick={() => setStep("pricing")}>
            Continue to pricing
          </button>
        </div>
      ) : null}

      {step === "pricing" ? (
        <div className="prop-pane">
          <div className="prop-kicker">Pricing & financing</div>
          <p className="prop-sub">
            {fromModules ? `Priced from the ${view.systemKw} kW surveyed array.` : `Priced from the ${view.systemKw} kW bill-plan size.`}
          </p>
          <dl className="prop-dl">
            <div>
              <dt>Gross</dt>
              <dd>
                {money(view.grossPrice)}
                <span className="prop-caveat">${SOLAR_MODEL.pricePerWatt.toFixed(2)}/W workspace rate × {view.systemKw} kW.</span>
              </dd>
            </div>
            <div>
              <dt>Federal ITC ({Math.round(SOLAR_MODEL.itc * 100)}%)</dt>
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
                <span className="prop-caveat">
                  Illustrative {SOLAR_MODEL.loanYears}-yr amortization at {(SOLAR_MODEL.loanApr * 100).toFixed(2)}% — not a lender quote.
                </span>
              </dd>
            </div>
            <div>
              <dt>Est. annual savings</dt>
              <dd>
                {money(view.annualSavings)}/yr
                <span className="prop-caveat">
                  ${SOLAR_MODEL.utilityRate.toFixed(2)}/kWh workspace rate × min(use, year-1 estimate).
                </span>
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
            {view.version ? `Saved v${view.version} · ${view.status}` : "Stamp a version from this design before presenting."}
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
          design={design}
          stamp={saved.arrayOutline}
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

function ArrayThumb({
  design,
  stamp,
}: {
  design: RoofDesign;
  stamp?: Proposal["arrayOutline"];
}) {
  const faces = stamp?.faces ?? design.faces ?? [];
  const modules = stamp?.modules ?? design.modules ?? [];
  if (!faces.length) return null;
  const panelWidthIn = stamp?.panelWidthIn ?? design.panelWidthIn ?? 41;
  const panelHeightIn = stamp?.panelHeightIn ?? design.panelHeightIn ?? 74;
  const dims = { ...design, panelWidthIn, panelHeightIn };
  const pts = faces.flatMap((face) => face.points);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(8, maxX - minX);
  const h = Math.max(8, maxY - minY);
  const pad = 6;
  return (
    <svg className="prop-array" viewBox={`${minX - pad} ${-(maxY + pad)} ${w + pad * 2} ${h + pad * 2}`} aria-label="Surveyed array">
      {faces.map((face) => (
        <polygon
          key={face.id}
          points={face.points.map((p) => `${p.x},${-p.y}`).join(" ")}
          className={face.eligible === false ? "blocked" : ""}
        />
      ))}
      {modules.map((mod, i) => {
        const corners = moduleCorners(
          {
            id: `stamp-${i}`,
            faceId: "",
            x: mod.x,
            y: mod.y,
            rotationDeg: mod.rotationDeg || 0,
            portrait: mod.portrait !== false,
          } as PlacedModule,
          dims,
        );
        return <polygon key={`mod-${i}`} className="mod" points={corners.map((p) => `${p.x},${-p.y}`).join(" ")} />;
      })}
    </svg>
  );
}

function ProposalPresent({
  view,
  design,
  stamp,
  onClose,
  onMarkPresented,
}: {
  view: View;
  design: RoofDesign;
  stamp?: Proposal["arrayOutline"];
  onClose: () => void;
  onMarkPresented: () => void;
}) {
  const surveyed = view.source === "modules";
  return (
    <div className="prop-present" role="dialog" aria-label="Customer proposal">
      <button type="button" className="prop-present-close" onClick={onClose}>
        Close
      </button>
      <article className="prop-sheet">
        <header className="prop-sheet-head">
          <div>
            <div className="prop-sheet-brand">Lumen</div>
            <div className="prop-sheet-brand-sub">Solar design proposal</div>
          </div>
          <div className="prop-sheet-meta">
            v{view.version}
            {view.status ? ` · ${view.status}` : ""}
          </div>
        </header>

        <p className="prop-sheet-for">Prepared for</p>
        <h1 className="prop-sheet-name">{view.customerName}</h1>
        <p className="prop-sheet-property">{view.address}</p>

        <section className="prop-sheet-hero">
          <div>
            <span>System</span>
            <b>{view.systemKw} kW</b>
            <em>
              {view.panelCount} × {view.panelWatts}W
            </em>
          </div>
          <div>
            <span>Cash after ITC</span>
            <b>{money(view.netPrice)}</b>
            <em>or {money(view.monthlyPayment)}/mo illustrative</em>
          </div>
          <div>
            <span>Estimated offset</span>
            <b>{view.offset}%</b>
            <em>of billed annual use</em>
          </div>
        </section>

        <div className="prop-sheet-split">
          <section>
            <h2>Designed array</h2>
            <ArrayThumb design={design} stamp={stamp} />
            <p>
              {view.panelWidthIn}×{view.panelHeightIn} in · {view.roofMaterial}
              {view.roofSqFt ? ` · ${view.roofSqFt} ft² surveyed roof` : ""}
            </p>
            <p>
              {compassLabel(view.azimuthDeg)} {view.azimuthDeg}° · {view.tiltDeg}° pitch
              {view.usableSqFt ? ` · ${view.usableSqFt} ft² usable after ${view.setbackFt} ft setback` : ""}
            </p>
            <p className="prop-sheet-fine">
              {surveyed
                ? `${view.faceCount || 1} roof face${view.faceCount === 1 ? "" : "s"} drawn on site imagery. Module count is from the design canvas.`
                : "No modules placed. Size is a planning figure from the monthly utility bill, not a surveyed array."}
            </p>
          </section>
          <section className="prop-sheet-ledger">
            <h2>Investment</h2>
            <dl>
              <div>
                <dt>Gross</dt>
                <dd>
                  {money(view.grossPrice)}
                  <span>${SOLAR_MODEL.pricePerWatt.toFixed(2)}/W</span>
                </dd>
              </div>
              <div>
                <dt>Federal ITC {Math.round(SOLAR_MODEL.itc * 100)}%</dt>
                <dd>−{money(view.incentive)}</dd>
              </div>
              <div>
                <dt>Cash after ITC</dt>
                <dd>{money(view.netPrice)}</dd>
              </div>
              <div>
                <dt>Illustrative loan</dt>
                <dd>{money(view.monthlyPayment)}/mo</dd>
              </div>
            </dl>
            <p className="prop-sheet-fine">
              {SOLAR_MODEL.loanYears}-year amortization at {(SOLAR_MODEL.loanApr * 100).toFixed(2)}%. Not a credit decision or lender quote.
            </p>
          </section>
        </div>

        <section className="prop-sheet-body">
          <div>
            <h2>Utility</h2>
            <p>
              {view.utility || "Utility"}
              {view.monthlyBill ? ` · $${view.monthlyBill}/mo` : ""}
              {view.annualUse ? ` · ~${view.annualUse.toLocaleString()} kWh/yr from that bill` : ""}
            </p>
          </div>
          <div>
            <h2>Year-1 production estimate</h2>
            <p>~{view.annualProduction.toLocaleString()} kWh · {money(view.annualSavings)}/yr modeled savings</p>
            <p className="prop-sheet-fine">
              {view.annualSunHours} published city sun hours, {view.shadeLoss}% assumed shade, {SOLAR_MODEL.inverterDerate} derate, $
              {SOLAR_MODEL.utilityRate.toFixed(2)}/kWh workspace rate. This is not LIDAR, a shade study, or a utility bill forecast.
            </p>
          </div>
          {view.notes && !/^\d+(\.\d+)? kW ·/.test(view.notes) && !view.notes.includes("no modules placed") ? (
            <div className="prop-sheet-notes">
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

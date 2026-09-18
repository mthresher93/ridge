"use client";

import { money, phonePretty } from "@/lib/format";
import type { DealCardModel } from "@/lib/crm-pipeline";
import { CRM_STAGES, type CrmStageId } from "@/lib/crm-pipeline";
import { dealHealthScore, daysInStage } from "@/lib/selectors";
import { useWorkspace } from "@/lib/workspace-context";

export function DealDetailDrawer({
  deal,
  onClose,
  onStage,
  onCall,
  onIntel,
  onWork,
}: {
  deal: DealCardModel;
  onClose: () => void;
  onStage: (id: CrmStageId) => void;
  onCall: () => void;
  onIntel: () => void;
  onWork: () => void;
}) {
  const { workspace } = useWorkspace();
  const health = dealHealthScore(deal, workspace);
  const age = daysInStage(deal, workspace);

  return (
    <aside className="deal-drawer" role="dialog" aria-label={`${deal.lead.name} deal`}>
      <header>
        <div>
          <h2>{deal.lead.name}</h2>
          <p>{deal.company}</p>
        </div>
        <button className="az-btn sm" type="button" aria-label="Close deal" onClick={onClose}>
          Close
        </button>
      </header>
      <label className="crm-filter">
        <span>Stage</span>
        <select className="az-input" value={deal.stageId} onChange={(event) => onStage(event.target.value as CrmStageId)} aria-label="Deal stage">
          {CRM_STAGES.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.label}
            </option>
          ))}
        </select>
      </label>
      <p className="tabular-nums">
        {deal.value ? money(deal.value) : "Rate unset"} · Health {health} · {age}d in stage
      </p>
      <p>{deal.contact ? `${deal.contact} books freight` : "No booker yet."}</p>
      <p>{deal.lead.nextAction || "No next action scheduled"}</p>
      <p className="tabular-nums">{deal.lead.phone ? phonePretty(deal.lead.phone) : "No published phone"}</p>
      <div className="deal-drawer-actions">
        <button className="az-btn pri sm" type="button" onClick={onWork}>
          Open Calls
        </button>
        <button className="az-btn sm" type="button" onClick={onCall} disabled={!deal.lead.phone}>
          Quick call
        </button>
        <button className="az-btn sm" type="button" onClick={onIntel}>
          Intel
        </button>
      </div>
    </aside>
  );
}

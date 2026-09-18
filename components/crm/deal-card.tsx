"use client";

import { money, phonePretty } from "@/lib/format";
import { closeChip } from "@/lib/clock";
import type { DealCardModel } from "@/lib/crm-pipeline";
import { nextStageId, stageById, weightedValue } from "@/lib/selectors";

export function DealCard({
  deal,
  health,
  ageDays,
  stale,
  close,
  selected,
  onOpen,
  onDragStart,
  onAdvance,
  onCall,
  onIntel,
}: {
  deal: DealCardModel;
  health: number;
  ageDays: number;
  stale: boolean;
  close: string;
  selected?: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onAdvance: () => void;
  onCall: () => void;
  onIntel: () => void;
}) {
  const stage = stageById(deal.stageId);
  const next = nextStageId(deal.stageId);
  const chip = closeChip(close);
  const weighted = weightedValue(deal);
  const rawTitle = deal.lead.listingTitle || deal.lane || "";
  const title = rawTitle && rawTitle !== deal.company && rawTitle !== deal.lead.name ? rawTitle : deal.lead.label || "Freight";
  const badge = `${deal.lead.freightType || deal.lead.label || "Yard"} · ${health}/100`;
  const ageLabel = ageDays >= 365 ? `${Math.round(ageDays / 365)}y in stage` : ageDays >= 60 ? `${Math.round(ageDays / 30)}mo in stage` : `${ageDays}d in stage`;

  return (
    <article
      className={`deal-card${selected ? " is-selected" : ""}`}
      draggable
      tabIndex={0}
      aria-label={`${deal.lead.name}, ${stage.label}`}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", deal.lead.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="deal-card-zone deal-z1">
        <b>{deal.company}</b>
        <span className="deal-title">{title}</span>
        <a className="deal-score-badge tabular-nums" href="/map" onClick={(event) => event.stopPropagation()}>
          {badge}
        </a>
      </div>
      <div className="deal-card-zone deal-z2">
        <strong className="tabular-nums deal-value">{deal.value ? money(deal.value) : "Rate unset"}</strong>
        <span className="tabular-nums deal-weighted">Weighted {money(weighted)}</span>
        <div className="deal-meter" aria-label={`${stage.probability} percent`}>
          <span style={{ width: `${stage.probability}%` }} />
        </div>
        {chip.label ? <em className={`due-chip tone-${chip.tone} tabular-nums`}>{chip.label}</em> : null}
      </div>
      <div className="deal-card-zone deal-z3">
        {deal.lead.nextAction ? (
          <p className="deal-next">{deal.lead.nextAction}</p>
        ) : (
          <p className="deal-next is-empty">No next action scheduled</p>
        )}
        {deal.lead.nextFollowUp ? <span className={`due-chip tone-${closeChip(deal.lead.nextFollowUp).tone} tabular-nums`}>{closeChip(deal.lead.nextFollowUp).label.replace("Closes", "Due")}</span> : null}
      </div>
      <div className="deal-card-zone deal-z4">
        <span className="tabular-nums">Health {health}</span>
        <span className={`tabular-nums${stale ? " tone-warn" : ""}`}>{ageLabel}</span>
        <span className="deal-stake">
          <span className="deal-avatar" aria-hidden="true">
            {(deal.contact || deal.lead.name).slice(0, 1).toUpperCase()}
          </span>
          {deal.contact ? `${deal.contact} · booker` : "No decision maker"}
        </span>
      </div>
      <div className="deal-card-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="az-btn sm" aria-label="Advance stage" title="Advance stage" disabled={!next} onClick={onAdvance}>
          Advance stage
        </button>
        <button type="button" className="az-btn sm" aria-label="Quick call" title="Quick call" disabled={!deal.lead.phone} onClick={onCall}>
          Quick call
        </button>
        <button type="button" className="az-btn sm" aria-label="Open Intel" title="Open Intel" onClick={onIntel}>
          Intel
        </button>
        <span className="deal-hint">{phonePretty(deal.lead.phone)}</span>
      </div>
    </article>
  );
}

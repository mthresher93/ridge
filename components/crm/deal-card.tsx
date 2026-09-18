"use client";

import { money, phonePretty } from "@/lib/format";
import { relativeToNow } from "@/lib/clock";
import type { DealCardModel } from "@/lib/crm-pipeline";
import { stageById } from "@/lib/crm-pipeline";

export function DealCard({
  deal,
  onOpen,
  onDragStart,
}: {
  deal: DealCardModel;
  onOpen: () => void;
  onDragStart: () => void;
}) {
  const stage = stageById(deal.stageId);
  const last = deal.lead.lastContactAt || deal.lead.updatedAt || deal.lead.createdAt;

  return (
    <button
      type="button"
      className="deal-card"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", deal.lead.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onClick={onOpen}
    >
      <div className="deal-card-zone deal-card-id">
        <b>{deal.lead.name}</b>
        <span className={`deal-grade grade-${deal.health.tone}`}>{deal.health.grade}</span>
      </div>
      <div className="deal-card-zone deal-card-intel">
        <span>{deal.lead.label || "Unlabeled"}</span>
        <span>{deal.contact ? deal.contact : "No booker"}</span>
        <span className="tabular-nums">{deal.health.label}</span>
      </div>
      <div className="deal-card-zone deal-card-money">
        <strong className="tabular-nums">{deal.value ? money(deal.value) : "Rate unset"}</strong>
        <em className="tabular-nums">{stage.probability}%</em>
      </div>
      <div className="deal-card-zone deal-card-activity">
        <span>{deal.lead.nextAction || "No next step"}</span>
        <span className="tabular-nums">{deal.lead.attempts || 0} tries · {relativeToNow(last)}</span>
      </div>
      <div className="deal-card-zone deal-card-foot">
        <span>{deal.lead.city || "Texas"}</span>
        <span className="tabular-nums">{deal.lead.phone ? phonePretty(deal.lead.phone) : "No phone"}</span>
        <span>{deal.owner}</span>
      </div>
    </button>
  );
}

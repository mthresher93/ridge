import { now, nowMs } from "../clock";
import { CRM_STAGES, dealsOnBoard, stageById, type CrmStageId, type DealCardModel } from "../crm-pipeline";
import type { Workspace } from "../types";

export const STAGE_STALE_DAYS: Record<CrmStageId, number> = {
  new: 3,
  contacted: 5,
  qualified: 7,
  meeting: 7,
  proposal: 10,
  negotiation: 10,
  won: 45,
  lost: 999,
};

export type PipelineKind = "all" | "yards" | "private" | "auction";

export const PIPELINE_KINDS: { id: PipelineKind; label: string }[] = [
  { id: "all", label: "All pipelines" },
  { id: "yards", label: "Yards" },
  { id: "private", label: "Private sellers" },
  { id: "auction", label: "Auction" },
];

export function isClosedStage(id: CrmStageId) {
  return id === "won" || id === "lost";
}

export function nextStageId(id: CrmStageId): CrmStageId | null {
  if (id === "won" || id === "lost") return null;
  const index = CRM_STAGES.findIndex((stage) => stage.id === id);
  const next = CRM_STAGES[index + 1];
  if (!next || next.id === "lost") return "won";
  return next.id;
}

export function stageEnteredAt(deal: DealCardModel, workspace: Workspace) {
  const opp = workspace.opportunities.find((item) => item.leadId === deal.lead.id);
  return opp?.stageEnteredAt || deal.lead.updatedAt || deal.lead.createdAt;
}

export function daysInStage(deal: DealCardModel, workspace: Workspace, at?: Date | number | string) {
  const entered = Date.parse(stageEnteredAt(deal, workspace));
  if (!Number.isFinite(entered)) return 0;
  return Math.max(0, Math.floor((nowMs(at) - entered) / 86400000));
}

export function isStageStale(deal: DealCardModel, workspace: Workspace, at?: Date | number | string) {
  return daysInStage(deal, workspace, at) > STAGE_STALE_DAYS[deal.stageId];
}

function recencyPoints(lead: DealCardModel["lead"], at?: Date | number | string) {
  const stamp = lead.lastContactAt || lead.updatedAt || lead.createdAt;
  const age = nowMs(at) - Date.parse(stamp || "");
  if (!Number.isFinite(age)) return 0;
  const days = age / 86400000;
  if (days <= 2) return 30;
  if (days <= 7) return 20;
  if (days <= 14) return 10;
  return 0;
}

function sentimentPoints(workspace: Workspace, leadId: string) {
  const logs = (workspace.callLogs || []).filter((item) => item.leadId === leadId);
  if (!logs.length) return 8;
  const last = logs.reduce((best, item) => (Date.parse(item.at) > Date.parse(best.at) ? item : best));
  const outcome = (last.outcome || "").toLowerCase();
  if (outcome.includes("talk") || outcome.includes("interest") || outcome.includes("quote")) return 20;
  if (outcome.includes("voicemail") || outcome.includes("no pickup")) return 6;
  if (outcome.includes("wrong") || outcome.includes("not interested")) return 0;
  return 8;
}

export function dealHealthScore(deal: DealCardModel, workspace: Workspace, at?: Date | number | string) {
  if (deal.lead.dnc || (deal.lead.tags || []).includes("wrong-number")) return 0;
  const yard = Math.min(40, Math.round((deal.lead.freightScore ?? 0) * 0.4));
  const recency = recencyPoints(deal.lead, at);
  const velocity = isStageStale(deal, workspace, at) ? 0 : 20;
  const booker = deal.contact ? 10 : 0;
  const sentiment = Math.min(20, sentimentPoints(workspace, deal.lead.id));
  return Math.max(0, Math.min(100, yard + recency + velocity + booker + sentiment));
}

export function closeDateOf(deal: DealCardModel, workspace: Workspace) {
  const opp = workspace.opportunities.find((item) => item.leadId === deal.lead.id);
  return opp?.expectedClose || deal.lead.nextFollowUp || "";
}

export function weightedValue(deal: DealCardModel) {
  return Math.round(deal.value * (deal.probability / 100));
}

export function matchesPipelineKind(deal: DealCardModel, kind: PipelineKind) {
  if (kind === "all") return true;
  const label = (deal.lead.label || "").toLowerCase();
  const role = (deal.lead.shipperRole || "").toLowerCase();
  if (kind === "yards") return label === "dealer" || label === "rental" || role === "yard";
  if (kind === "private") return label.includes("private") || role === "private";
  if (kind === "auction") return label === "auction" || role === "auction";
  return true;
}

export type DealFilters = {
  query?: string;
  owner?: string;
  kind?: PipelineKind;
  minHealth?: number;
  myDeals?: boolean;
  closeFrom?: string;
  closeTo?: string;
  me?: string;
};

export function filterDeals(workspace: Workspace, filters: DealFilters = {}, at?: Date | number | string) {
  const query = (filters.query || "").trim().toLowerCase();
  const owner = filters.owner || "all";
  const kind = filters.kind || "all";
  const minHealth = filters.minHealth ?? 0;
  const me = filters.me || workspace.settings.operator || workspace.settings.defaultOwner || "Michael";
  return dealsOnBoard(workspace).filter((deal) => {
    if (kind !== "all" && !matchesPipelineKind(deal, kind)) return false;
    if (owner !== "all" && deal.owner !== owner) return false;
    if (filters.myDeals && deal.owner !== me) return false;
    if (dealHealthScore(deal, workspace, at) < minHealth) return false;
    const close = closeDateOf(deal, workspace);
    if (filters.closeFrom && close && close < filters.closeFrom) return false;
    if (filters.closeTo && close && close > filters.closeTo) return false;
    if (filters.closeFrom && !close) return false;
    if (!query) return true;
    const hay = [deal.lead.name, deal.company, deal.contact, deal.lead.city, deal.lead.phone, deal.lane].join(" ").toLowerCase();
    return hay.includes(query);
  });
}

export function openDeals(deals: DealCardModel[]) {
  return deals.filter((deal) => !isClosedStage(deal.stageId));
}

export function openPipeline(deals: DealCardModel[]) {
  return openDeals(deals).reduce((sum, deal) => sum + deal.value, 0);
}

export function weightedPipeline(deals: DealCardModel[]) {
  return openDeals(deals).reduce((sum, deal) => sum + weightedValue(deal), 0);
}

export function wonRevenue(deals: DealCardModel[], workspace: Workspace, at?: Date | number | string) {
  const start = now(at);
  const from = Date.UTC(start.getFullYear(), start.getMonth(), 1);
  return deals
    .filter((deal) => deal.stageId === "won")
    .filter((deal) => {
      const stamp = Date.parse(stageEnteredAt(deal, workspace));
      return Number.isFinite(stamp) && stamp >= from;
    })
    .reduce((sum, deal) => sum + deal.value, 0);
}

export function pipelineVelocity(deals: DealCardModel[], workspace: Workspace, at?: Date | number | string) {
  const won = deals.filter((deal) => deal.stageId === "won");
  const sample = won.length ? won : openDeals(deals);
  if (!sample.length) return 0;
  const total = sample.reduce((sum, deal) => {
    const start = Date.parse(deal.lead.createdAt);
    const end = deal.stageId === "won" ? Date.parse(stageEnteredAt(deal, workspace)) : nowMs(at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return sum;
    return sum + (end - start) / 86400000;
  }, 0);
  return Math.round(total / sample.length);
}

export function dealsByOpenStage(deals: DealCardModel[]) {
  return CRM_STAGES.map((stage) => {
    const rows = deals.filter((deal) => deal.stageId === stage.id);
    return {
      stage,
      deals: rows,
      value: rows.reduce((sum, deal) => sum + deal.value, 0),
      weighted: rows.reduce((sum, deal) => sum + weightedValue(deal), 0),
      avgProbability: rows.length ? Math.round(rows.reduce((sum, deal) => sum + deal.probability, 0) / rows.length) : stage.probability,
    };
  });
}

export function siteCount(workspace: Workspace) {
  return workspace.leads.filter((lead) => !lead.archivedAt).length;
}

export { stageById };

import { nowIso } from "./clock";
import type { Lead, Opportunity, Workspace } from "./types";
import { uid } from "./format";

export type CrmStageId =
  | "new"
  | "contacted"
  | "qualified"
  | "meeting"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost";

export type CrmStage = {
  id: CrmStageId;
  label: string;
  probability: number;
  accent: string;
  collapsedByDefault?: boolean;
  leadStatus: string;
};

export const CRM_STAGES: CrmStage[] = [
  { id: "new", label: "New", probability: 5, accent: "slate", leadStatus: "Discovered" },
  { id: "contacted", label: "Contacted", probability: 10, accent: "steel", leadStatus: "Contacted" },
  { id: "qualified", label: "Qualified", probability: 25, accent: "sapphire", leadStatus: "Qualified" },
  { id: "meeting", label: "Meeting", probability: 40, accent: "cobalt", leadStatus: "Contact Info Obtained" },
  { id: "proposal", label: "Proposal", probability: 60, accent: "violet", leadStatus: "Quote Requested" },
  { id: "negotiation", label: "Negotiation", probability: 80, accent: "amber", leadStatus: "Negotiating" },
  { id: "won", label: "Won", probability: 100, accent: "emerald", leadStatus: "Load Won" },
  { id: "lost", label: "Lost", probability: 0, accent: "charcoal", collapsedByDefault: true, leadStatus: "Load Lost" },
];

const STATUS_TO_STAGE: Record<string, CrmStageId> = {
  Discovered: "new",
  "Ready to Contact": "new",
  Contacted: "contacted",
  Replied: "qualified",
  Qualified: "qualified",
  "Contact Info Obtained": "meeting",
  "Quote Requested": "proposal",
  "Quote Sent": "negotiation",
  Negotiating: "negotiation",
  "Load Won": "won",
  "Recurring Account": "won",
  "Load Lost": "lost",
};

export function stageById(id: string) {
  return CRM_STAGES.find((item) => item.id === id) || CRM_STAGES[0];
}

export function crmStageOf(lead: Lead, workspace?: Workspace): CrmStageId {
  const opp = workspace?.opportunities.find((item) => item.leadId === lead.id);
  if (opp?.stage && CRM_STAGES.some((item) => item.id === opp.stage)) return opp.stage as CrmStageId;
  if (opp?.stage && STATUS_TO_STAGE[opp.stage]) return STATUS_TO_STAGE[opp.stage];
  return STATUS_TO_STAGE[lead.status] || "new";
}

export function dealHealth(lead: Lead) {
  const score = lead.freightScore ?? 0;
  if (lead.dnc || (lead.tags || []).includes("wrong-number")) return { grade: "F", label: "Dead", tone: "bad" as const };
  if (score >= 80 && lead.booker && lead.phone) return { grade: "A", label: "Hot", tone: "ok" as const };
  if (score >= 60 && lead.phone) return { grade: "B", label: "Strong", tone: "ok" as const };
  if (lead.phone && lead.label) return { grade: "C", label: "Workable", tone: "warn" as const };
  if (lead.phone) return { grade: "D", label: "Thin", tone: "warn" as const };
  return { grade: "F", label: "No phone", tone: "bad" as const };
}

export function dealValue(lead: Lead, workspace: Workspace) {
  const opp = workspace.opportunities.find((item) => item.leadId === lead.id);
  if (opp && opp.value > 0) return opp.value;
  const quote = (workspace.quotes || []).find((item) => item.leadId === lead.id);
  if (quote && quote.customerRate > 0) return quote.customerRate;
  const ship = (workspace.shipments || []).find((item) => item.leadId === lead.id);
  if (ship && ship.customerRate > 0) return ship.customerRate;
  return lead.estimatedValue || 0;
}

export type DealCardModel = {
  lead: Lead;
  stageId: CrmStageId;
  probability: number;
  value: number;
  health: ReturnType<typeof dealHealth>;
  company: string;
  contact: string;
  lane: string;
  owner: string;
};

export function dealsOnBoard(workspace: Workspace): DealCardModel[] {
  return workspace.leads
    .filter((lead) => !lead.archivedAt)
    .map((lead) => {
      const stageId = crmStageOf(lead, workspace);
      const stage = stageById(stageId);
      return {
        lead,
        stageId,
        probability: stage.probability,
        value: dealValue(lead, workspace),
        health: dealHealth(lead),
        company: lead.company || lead.property || lead.name,
        contact: lead.booker || lead.homeowner || "",
        lane: [lead.origin || lead.city, lead.destination].filter(Boolean).join(" → "),
        owner: lead.owner || workspace.settings.defaultOwner || "Michael",
      };
    });
}

export function dealsByStage(workspace: Workspace) {
  const deals = dealsOnBoard(workspace);
  return CRM_STAGES.map((stage) => ({
    stage,
    deals: deals.filter((item) => item.stageId === stage.id),
    value: deals.filter((item) => item.stageId === stage.id).reduce((sum, item) => sum + item.value, 0),
  }));
}

function upsertOpportunity(workspace: Workspace, lead: Lead, stage: CrmStage, at: string): Opportunity[] {
  const existing = workspace.opportunities.find((item) => item.leadId === lead.id);
  if (existing) {
    return workspace.opportunities.map((item) =>
      item.id === existing.id
        ? {
            ...item,
            stage: stage.id,
            probability: stage.probability,
            updatedAt: at,
            stageEnteredAt: item.stage === stage.id ? item.stageEnteredAt : at,
            history: [...(item.history || []), { from: item.stage, to: stage.id, at, source: "pipeline" }],
          }
        : item,
    );
  }
  const created: Opportunity = {
    id: uid("opp"),
    leadId: lead.id,
    name: lead.name,
    property: lead.company || lead.property || lead.name,
    stage: stage.id,
    value: dealValue(lead, workspace),
    probability: stage.probability,
    owner: lead.owner || workspace.settings.defaultOwner || "Michael",
    source: lead.source,
    nextAction: lead.nextAction,
    expectedClose: "",
    notes: "",
    createdAt: at,
    updatedAt: at,
    stageEnteredAt: at,
    history: [{ from: "", to: stage.id, at, source: "pipeline" }],
    origin: lead.origin || lead.city,
    destination: lead.destination,
    freightType: lead.freightType,
  };
  return [...workspace.opportunities, created];
}

export function moveLeadToCrmStage(workspace: Workspace, leadId: string, stageId: CrmStageId, at = nowIso()): Workspace {
  const stage = stageById(stageId);
  const lead = workspace.leads.find((item) => item.id === leadId);
  if (!lead || crmStageOf(lead, workspace) === stageId) return workspace;
  const nextAction =
    stageId === "lost"
      ? "Closed lost"
      : stageId === "won"
        ? "Cover the load"
        : stageId === "proposal"
          ? "Send a quote when they ask"
          : stageId === "meeting"
            ? "Meet the booker"
            : lead.nextAction;
  const leads = workspace.leads.map((item) =>
    item.id === leadId
      ? {
          ...item,
          status: stage.leadStatus,
          nextAction,
          updatedAt: at,
          lastContactAt: stageId === "new" ? item.lastContactAt : item.lastContactAt || at,
        }
      : item,
  );
  const current = leads.find((item) => item.id === leadId)!;
  return {
    ...workspace,
    leads,
    opportunities: upsertOpportunity({ ...workspace, leads }, current, stage, at),
    updatedAt: at,
  };
}

export function pipelineCsv(workspace: Workspace) {
  const rows = [["Yard", "Stage", "Grade", "Value", "Probability", "City", "Phone", "Booker", "Owner"]];
  for (const deal of dealsOnBoard(workspace)) {
    rows.push([
      deal.lead.name,
      stageById(deal.stageId).label,
      deal.health.grade,
      String(deal.value),
      `${deal.probability}%`,
      [deal.lead.city, deal.lead.state].filter(Boolean).join(", "),
      deal.lead.phone,
      deal.contact,
      deal.owner,
    ]);
  }
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

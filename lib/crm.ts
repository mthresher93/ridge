import type { Callback, Opportunity, Workspace } from "./types";
import type { DispositionId } from "./dispositions";
import { nowIso, uid } from "./format";

const STAGE_BY_DISPOSITION: Partial<Record<DispositionId, string>> = {
  appointment_set: "Quote Requested",
  callback_scheduled: "Replied",
  qualified_lead: "Qualified",
  not_interested: "Load Lost",
  disqualified: "Load Lost",
};

const PROBABILITY: Record<string, number> = {
  "Quote Requested": 45,
  Replied: 30,
  Qualified: 40,
  "Load Lost": 0,
  "Quote Sent": 50,
  Negotiating: 60,
  "Load Won": 100,
  "Recurring Account": 100,
};

/** Move or create the Board opportunity when a dialer wrap changes stage. */
export function syncOpportunityFromWrap(
  workspace: Workspace,
  leadId: string,
  disposition: DispositionId,
  source = "dialer",
): Opportunity[] {
  const stage = STAGE_BY_DISPOSITION[disposition];
  if (!stage) return workspace.opportunities;

  const lead = workspace.leads.find((item) => item.id === leadId);
  if (!lead) return workspace.opportunities;

  const existing = workspace.opportunities.find((item) => item.leadId === leadId);
  const stamp = nowIso();

  if (existing) {
    if (existing.stage === stage) return workspace.opportunities;
    return workspace.opportunities.map((item) =>
      item.id === existing.id
        ? {
            ...item,
            stage,
            name: lead.name,
            property: lead.property || item.property,
            probability: PROBABILITY[stage] ?? item.probability,
            value: item.value || 0,
            stageEnteredAt: stamp,
            updatedAt: stamp,
            history: [{ from: item.stage, to: stage, at: stamp, source }, ...item.history],
          }
        : item,
    );
  }

  const created: Opportunity = {
    id: uid("opp"),
    leadId,
    name: lead.name,
    property: lead.property,
    stage,
    value: 0,
    probability: PROBABILITY[stage] ?? 20,
    owner: lead.owner || workspace.settings.defaultOwner,
    source: lead.source || "Dialer",
    nextAction: lead.nextAction,
    expectedClose: "",
    notes: lead.notes,
    createdAt: stamp,
    updatedAt: stamp,
    stageEnteredAt: stamp,
    history: [{ from: "Discovered", to: stage, at: stamp, source }],
  };
  return [created, ...workspace.opportunities];
}

/** Close open callbacks for a lead after a successful wrap that resolves them. */
export function completeOpenCallbacks(
  callbacks: Callback[],
  leadId: string,
  disposition: DispositionId,
): Callback[] {
  const resolving = disposition === "appointment_set" || disposition === "callback_scheduled" || disposition === "dnc" || disposition === "not_interested" || disposition === "disqualified";
  if (!resolving) return callbacks;
  const stamp = nowIso();
  return callbacks.map((item) =>
    item.leadId === leadId && item.status === "open"
      ? { ...item, status: "completed" as const, completedAt: stamp }
      : item,
  );
}

export function createLinkedOpportunity(workspace: Workspace, leadId: string, name: string, property: string): Opportunity {
  const stamp = nowIso();
  return {
    id: uid("opp"),
    leadId,
    name,
    property,
    stage: "Discovered",
    value: 0,
    probability: 10,
    owner: workspace.settings.defaultOwner,
    source: "Manual",
    nextAction: "Label this client, then send the opener",
    expectedClose: "",
    notes: "",
    createdAt: stamp,
    updatedAt: stamp,
    stageEnteredAt: stamp,
    history: [],
  };
}

export function cascadeDeleteLead(workspace: Workspace, leadId: string): Workspace {
  const designs = { ...(workspace.designs || {}) };
  const proposals = { ...(workspace.proposals || {}) };
  delete designs[leadId];
  delete proposals[leadId];
  return {
    ...workspace,
    leads: workspace.leads.filter((item) => item.id !== leadId),
    opportunities: workspace.opportunities.filter((item) => item.leadId !== leadId),
    callbacks: workspace.callbacks.filter((item) => item.leadId !== leadId),
    appointments: workspace.appointments.filter((item) => item.leadId !== leadId),
    callLogs: (workspace.callLogs || []).filter((item) => item.leadId !== leadId),
    listings: (workspace.listings || []).filter((item) => item.leadId !== leadId),
    quotes: (workspace.quotes || []).filter((item) => item.leadId !== leadId),
    shipments: (workspace.shipments || []).filter((item) => item.leadId !== leadId),
    analyses: (workspace.analyses || []).filter((item) => item.leadId !== leadId),
    designs,
    proposals,
    updatedAt: nowIso(),
  };
}

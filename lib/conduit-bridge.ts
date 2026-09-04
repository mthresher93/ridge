import type { Appointment, Callback, Lead, Opportunity, Workspace } from "./types";
import { emptyWorkspace } from "./seed";

type ConduitLead = Record<string, unknown> & { id?: string; name?: string };
type ConduitCrm = {
  version?: number;
  leads?: ConduitLead[];
  opportunities?: Array<Record<string, unknown>>;
  callbacks?: Array<Record<string, unknown>>;
  appointments?: Array<Record<string, unknown>>;
  tasks?: unknown[];
  kpiEvents?: Array<Record<string, unknown>>;
  agentAudit?: unknown[];
  imports?: unknown[];
  activities?: Array<Record<string, unknown>>;
  starterWorkspace?: boolean;
  updatedAt?: string;
};

function str(value: unknown, fallback = "") {
  return value == null ? fallback : String(value);
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function consent(value: unknown): Lead["consent"] {
  if (value === "verified" || value === "missing" || value === "unknown") return value;
  return "unknown";
}

function priority(value: unknown): Lead["priority"] {
  if (value === "Low" || value === "Medium" || value === "High" || value === "Critical") return value;
  return "Medium";
}

export function azimuthToConduit(workspace: Workspace): ConduitCrm {
  return {
    version: 2,
    leads: workspace.leads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      company: lead.property,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      state: lead.state || "",
      address: lead.address || [lead.property, lead.city].filter(Boolean).join(", "),
      status: lead.status,
      priority: lead.priority,
      owner: lead.owner,
      source: lead.source,
      consent: lead.consent,
      dnc: lead.dnc,
      attempts: lead.attempts,
      nextAction: lead.nextAction,
      nextFollowUp: lead.nextFollowUp,
      estimatedValue: lead.estimatedValue,
      notes: lead.notes,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    })),
    opportunities: workspace.opportunities.map((opp) => ({
      ...opp,
      company: opp.property,
    })),
    callbacks: workspace.callbacks,
    appointments: workspace.appointments,
    tasks: [],
    kpiEvents: workspace.kpiEvents,
    agentAudit: [],
    imports: [],
    activities: workspace.activities,
    starterWorkspace: false,
    updatedAt: workspace.updatedAt,
  };
}

function leadFromConduit(row: ConduitLead, existing?: Lead): Lead {
  const property = str(row.company || row.property, existing?.property || "");
  return {
    id: str(row.id, existing?.id || `lead-${Date.now()}`),
    name: str(row.name, existing?.name || "Unnamed"),
    property,
    phone: str(row.phone, existing?.phone || ""),
    email: str(row.email, existing?.email || ""),
    city: str(row.city, existing?.city || ""),
    state: str(row.state, existing?.state || ""),
    address: str(row.address, existing?.address || ""),
    utility: existing?.utility || str(row.utility),
    monthlyBill: row.monthlyBill == null ? existing?.monthlyBill ?? null : num(row.monthlyBill, 0),
    status: str(row.status, existing?.status || "New Lead"),
    priority: priority(row.priority ?? existing?.priority),
    owner: str(row.owner, existing?.owner || "Unassigned"),
    source: str(row.source, existing?.source || "Manual"),
    consent: consent(row.consent ?? existing?.consent),
    dnc: Boolean(row.dnc ?? existing?.dnc),
    attempts: num(row.attempts, existing?.attempts || 0),
    nextAction: str(row.nextAction, existing?.nextAction || ""),
    nextFollowUp: str(row.nextFollowUp, existing?.nextFollowUp || ""),
    estimatedValue: num(row.estimatedValue, existing?.estimatedValue || 0),
    notes: str(row.notes, existing?.notes || ""),
    homeowner: existing?.homeowner || str(row.homeowner, "Unknown"),
    createdAt: str(row.createdAt, existing?.createdAt || new Date().toISOString()),
    updatedAt: str(row.updatedAt, new Date().toISOString()),
  };
}

function oppFromConduit(row: Record<string, unknown>, existing?: Opportunity): Opportunity {
  return {
    id: str(row.id, existing?.id || `opp-${Date.now()}`),
    leadId: row.leadId == null ? existing?.leadId ?? null : str(row.leadId) || null,
    name: str(row.name, existing?.name || ""),
    property: str(row.company || row.property, existing?.property || ""),
    stage: str(row.stage, existing?.stage || "New Lead"),
    value: num(row.value, existing?.value || 0),
    probability: num(row.probability, existing?.probability || 0),
    owner: str(row.owner, existing?.owner || "Unassigned"),
    source: str(row.source, existing?.source || "Manual"),
    nextAction: str(row.nextAction, existing?.nextAction || ""),
    expectedClose: str(row.expectedClose, existing?.expectedClose || ""),
    notes: str(row.notes, existing?.notes || ""),
    createdAt: str(row.createdAt, existing?.createdAt || new Date().toISOString()),
    updatedAt: str(row.updatedAt, new Date().toISOString()),
    stageEnteredAt: str(row.stageEnteredAt, existing?.stageEnteredAt || new Date().toISOString()),
    history: Array.isArray(row.history) ? (row.history as Opportunity["history"]) : existing?.history || [],
  };
}

export function mergeConduitIntoAzimuth(workspace: Workspace, crm: unknown): Workspace {
  if (!crm || typeof crm !== "object") return workspace;
  const incoming = crm as ConduitCrm;
  const byLead = new Map(workspace.leads.map((lead) => [lead.id, lead]));
  const byOpp = new Map(workspace.opportunities.map((opp) => [opp.id, opp]));
  const leads = (incoming.leads || []).map((row) => leadFromConduit(row, byLead.get(str(row.id))));
  const leadIds = new Set(leads.map((lead) => lead.id));
  const opportunities = (incoming.opportunities || []).map((row) => oppFromConduit(row, byOpp.get(str(row.id))));
  const callbacks = (incoming.callbacks || []) as Callback[];
  const appointments = (incoming.appointments || []) as Appointment[];
  const keptDesigns = Object.fromEntries(
    Object.entries(workspace.designs || {}).filter(([id]) => leadIds.has(id) || byLead.has(id)),
  );
  const keptProposals = Object.fromEntries(
    Object.entries(workspace.proposals || {}).filter(([id]) => leadIds.has(id) || byLead.has(id)),
  );

  return {
    ...workspace,
    leads,
    opportunities,
    callbacks,
    appointments,
    activities: (incoming.activities as Workspace["activities"]) || workspace.activities,
    kpiEvents: (incoming.kpiEvents as Workspace["kpiEvents"]) || workspace.kpiEvents,
    designs: keptDesigns,
    proposals: keptProposals,
    updatedAt: incoming.updatedAt || new Date().toISOString(),
  };
}

export function parseConduitCrm(raw: string | undefined): ConduitCrm | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ConduitCrm;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function emptyAzimuth(): Workspace {
  return emptyWorkspace();
}

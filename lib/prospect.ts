import type { FreightAnalysis, Lead, ShipperRole, Workspace } from "./types";
import { generateOpeningMessage, openingLines, suggestClientKind } from "./freight";
import { looksLikeYardName } from "./yard";
import { nowIso, uid } from "./format";

export function yardRole(lead: Lead): ShipperRole {
  if (lead.shipperRole && lead.shipperRole !== "Unknown") return lead.shipperRole;
  if (lead.label === "Dealer" || lead.label === "Rental") return "Yard";
  const hay = [lead.name, lead.company, lead.listingTitle, lead.listingDescription].filter(Boolean).join(" ");
  if (looksLikeYardName(hay) || /\b(dealer|dealership|rental|machinery|bobcat|hyster|komatsu)\b/i.test(hay)) return "Yard";
  return "Unknown";
}

export function analysisFromLead(lead: Lead): FreightAnalysis {
  const role = yardRole(lead);
  const item = (lead.equipmentType || "machine").toLowerCase();
  const lines = openingLines(item, role);
  return {
    leadId: lead.id,
    score: lead.freightScore || 0,
    confidence: lead.scoreConfidence || "LOW",
    why: lead.scoreWhy || "",
    freightType: lead.freightType || "Unknown",
    recurringPotential: lead.recurringPotential || "Low",
    known: [],
    estimates: [],
    unknown: [],
    openerCasual: lines.Casual[0],
    openerDirect: lines.Direct[0],
    openerBusiness: lines.Business[0],
    openerShort: lines.Short[0],
    openerFollowUp: lines.FollowUp[0],
    analyzedAt: "",
    shipperRole: role,
    trailerHint: lead.trailerHint,
    loadClass: lead.loadClass,
  };
}

export function openerForLead(lead: Lead, sentToday = 0) {
  return generateOpeningMessage(analysisFromLead(lead), "Very Short", lead.id, sentToday);
}

export function firstCall(lead: Lead, sentToday = 0) {
  const role = yardRole(lead);
  return {
    ask:
      role === "Yard"
        ? "Who books outbound freight when a machine sells? Backup on the routing guide — not replace their guy."
        : "Pickup only, or do they need a truck if the buyer is out of state?",
    opener: openerForLead(lead, sentToday),
    why:
      lead.scoreWhy ||
      (role === "Yard"
        ? "Named yard with a published phone. They already move sold iron."
        : "Confirm freight is even on them before you quote."),
  };
}

export type CallOutcome = "no_pickup" | "voicemail" | "wrong_number" | "talked";

export function applyCallOutcome(lead: Lead, outcome: CallOutcome, stamp: string, due: string, extra?: { booker?: string; bookerPhone?: string }): Lead {
  const attempts = (lead.attempts || 0) + 1;
  if (outcome === "talked") {
    const booker = (extra?.booker || lead.booker || "").trim();
    return {
      ...lead,
      attempts,
      lastContactAt: stamp,
      status: lead.status === "Discovered" || lead.status === "Ready to Contact" ? "Contacted" : lead.status,
      booker: booker || lead.booker,
      bookerPhone: extra?.bookerPhone || lead.bookerPhone,
      nextAction: booker ? `Talked to ${booker}. Dest, specs, blank quote.` : "They picked up. Save who books freight, then specs.",
      updatedAt: stamp,
    };
  }
  if (outcome === "wrong_number") {
    return {
      ...lead,
      attempts,
      lastContactAt: stamp,
      nextAction: "Wrong number. Hunt another published phone or skip this yard.",
      tags: Array.from(new Set([...(lead.tags || []), "wrong-number"])),
      updatedAt: stamp,
    };
  }
  return {
    ...lead,
    attempts,
    lastContactAt: stamp,
    nextAction: outcome === "voicemail" ? "Voicemail. Copy the opener and send it." : "No pickup. Copy the opener and send it.",
    nextFollowUp: due,
    updatedAt: stamp,
  };
}

export function recordCallAttempt(
  workspace: Workspace,
  leadId: string,
  outcome: CallOutcome,
  stamp = nowIso(),
  extra?: { booker?: string; bookerPhone?: string },
): Workspace {
  const lead = workspace.leads.find((item) => item.id === leadId);
  if (!lead) return workspace;
  const due = new Date(Date.parse(stamp) + 86400000).toISOString();
  const next = applyCallOutcome(lead, outcome, stamp, due, extra);
  const follow =
    outcome === "voicemail" || outcome === "no_pickup"
      ? {
          id: uid("cb"),
          leadId,
          type: "standard" as const,
          dueAt: due,
          reason: outcome === "voicemail" ? "Voicemail — send the opener" : "No pickup — send the opener",
          assignedUser: workspace.settings.operator,
          notes: extra?.booker || "",
          status: "open" as const,
          createdAt: stamp,
        }
      : null;
  return {
    ...workspace,
    leads: workspace.leads.map((item) => (item.id === leadId ? next : item)),
    callbacks: follow ? [follow, ...workspace.callbacks.filter((item) => !(item.leadId === leadId && item.status === "open"))] : workspace.callbacks,
    callLogs: [{ id: uid("call"), leadId, outcome, duration: 0, notes: extra?.booker || extra?.bookerPhone || "", at: stamp }, ...(workspace.callLogs || [])],
    updatedAt: stamp,
  };
}

export function labelObviousYards(leads: Lead[], stamp = nowIso()) {
  return leads.map((lead) => {
    if (lead.archivedAt || lead.label) return lead;
    const kind = suggestClientKind({
      sellerName: lead.name,
      title: lead.listingTitle,
      source: lead.source,
      website: lead.website,
    });
    if (kind !== "Dealer" && kind !== "Rental") return lead;
    return {
      ...lead,
      label: kind,
      nextAction: lead.nextAction.startsWith("Label") ? "Call the published number" : lead.nextAction,
      updatedAt: stamp,
    };
  });
}

export function obviousYardCount(leads: Lead[]) {
  return leads.filter((lead) => {
    if (lead.archivedAt || lead.label) return false;
    const kind = suggestClientKind({ sellerName: lead.name, title: lead.listingTitle, source: lead.source, website: lead.website });
    return kind === "Dealer" || kind === "Rental";
  }).length;
}

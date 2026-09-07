import type { Lead, RoofDesign, Workspace } from "./types";
import { estimateFor } from "./solar";
import { money, phonePretty } from "./format";
import { objectionsFor, scriptFor } from "./scripts";
import { derive } from "./derive";

export type StudioToolId = "talk" | "objections" | "proposal" | "sit" | "campaign" | "handoff";

export const STUDIO_TOOLS: { id: StudioToolId; label: string; blurb: string }[] = [
  { id: "talk", label: "Talk track", blurb: "Local opener from bill, roof, and last note." },
  { id: "objections", label: "Objection pack", blurb: "Deterministic holds — not invented answers." },
  { id: "proposal", label: "Proposal summary", blurb: "Freeze the live estimate into review copy." },
  { id: "sit", label: "Sit prep", blurb: "Both signers, bill, heading, and risk." },
  { id: "campaign", label: "Campaign brief", blurb: "City demand draft. No spend." },
  { id: "handoff", label: "Handoff note", blurb: "What the closer needs, nothing extra." },
];

export function runStudio(id: StudioToolId, workspace: Workspace, lead: Lead | null, design?: RoofDesign | null) {
  const est = lead && design ? estimateFor(lead, design) : null;
  const metrics = derive(workspace);
  const first = lead?.name.split(" ")[0] || "this household";

  if (id === "talk") {
    const beats = scriptFor(lead, design);
    return {
      title: `Talk track · ${lead?.name || "no lead"}`,
      body: beats.map((beat) => `${beat.label.toUpperCase()}\n${beat.say}\nCue: ${beat.cue}`).join("\n\n"),
      gate: "Local draft. Do not send until you approve.",
    };
  }

  if (id === "objections") {
    const beats = objectionsFor(lead);
    return {
      title: `Objection pack · ${lead?.name || "generic"}`,
      body: beats.map((beat) => `${beat.label.toUpperCase()}\n${beat.say}\nCue: ${beat.cue}`).join("\n\n"),
      gate: "Local draft. Attach only after a human yes.",
    };
  }

  if (id === "proposal") {
    if (!lead || !est) {
      return {
        title: "Proposal summary",
        body: "Pick a lead with a roof model. Production and price stay blank until a design exists.",
        gate: "Blocked — missing design.",
      };
    }
    return {
      title: `Proposal summary · ${lead.name}`,
      body: [
        `${lead.name} · ${lead.property || lead.city}`,
        `${est.systemKw} kW · ${est.panelCount} × ${design?.panelWatts || 425}W`,
        `Offset ${est.offset}% · Year-1 ${est.annualProduction.toLocaleString()} kWh`,
        `Cash ${money(est.netPrice)} after ITC · Loan ${money(est.monthlyPayment)}/mo`,
        `Bill baseline ${lead.monthlyBill ? money(lead.monthlyBill) : "unknown"} · Utility ${lead.utility || "unset"}`,
        lead.notes ? `Last note: ${lead.notes}` : "No note on file.",
      ].join("\n"),
      gate: "Local draft. Not a signed contract.",
    };
  }

  if (id === "sit") {
    if (!lead) {
      return { title: "Sit prep", body: "Select a lead first.", gate: "Blocked — no lead." };
    }
    const sit = workspace.appointments.find((item) => item.leadId === lead.id && item.status === "scheduled");
    return {
      title: `Sit prep · ${lead.name}`,
      body: [
        `Household: ${lead.homeowner || "unknown"} · Decision: both signers required`,
        `Phone ${phonePretty(lead.phone)} · Consent ${lead.consent} · DNC ${lead.dnc ? "YES" : "no"}`,
        `Bill ${lead.monthlyBill ? money(lead.monthlyBill) : "bring last 12 months"} · ${lead.utility || "utility unset"}`,
        est ? `Planning ${est.systemKw} kW / ${est.offset}% offset` : "Roof not surveyed — do not quote.",
        sit ? `On calendar: ${sit.type} · ${sit.closer} closer · ${sit.location}` : "No sit on the book.",
        `Next action: ${lead.nextAction || "confirm both signers and the bill."}`,
      ].join("\n"),
      gate: "Prep only. Confirm the sit yourself.",
    };
  }

  if (id === "campaign") {
    const cities = Array.from(new Set(workspace.leads.map((item) => item.city).filter(Boolean)));
    const city = lead?.city || cities[0] || "West Coast";
    const count = workspace.leads.filter((item) => item.city === city).length;
    return {
      title: `Campaign brief · ${city}`,
      body: [
        `Audience: homeowners in ${city} with recorded utility pain.`,
        `Demand on file: ${count} leads · ${metrics.callable.length} callable now.`,
        `Hook: “Your ${lead?.utility || "utility"} bill is the number. We size the roof against it.”`,
        `Proof required: one named household with bill-in / bill-out. Do not invent.`,
        `CTA: 15-minute bill review. No live spend from this draft.`,
        `Honesty: ${metrics.overdueCallbacks.length} overdue callbacks beat any ad.`,
      ].join("\n"),
      gate: "Draft only. Does not buy media.",
    };
  }

  return {
    title: `Handoff · ${lead?.name || "unassigned"}`,
    body: [
      `${first} is ${lead?.status || "unassigned"}.`,
      `Value on board: ${lead?.estimatedValue ? money(lead.estimatedValue) : "unset"}.`,
      `Why now: ${lead?.nextAction || "no next action on the record."}`,
      est ? `System on the roof model: ${est.systemKw} kW.` : "No roof model — closer should not price.",
      `Open pipeline: ${metrics.open.length} deals · ${money(metrics.openValue)} visible.`,
    ].join("\n"),
    gate: "Internal note. Do not email the customer from here.",
  };
}

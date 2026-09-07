import type { Workspace } from "./types";
import { companyName, funnelCounts, generateFollowUp, generateOpeningMessage, leadLocation, shipmentMargin, summarizeProspect } from "./freight";
import { money } from "./format";

export type CopilotAnswer = {
  answer: string;
  matches: { id: string; label: string }[];
};

function q(text: string) {
  return text.trim().toLowerCase();
}

export function answerCopilot(workspace: Workspace, question: string): CopilotAnswer {
  const query = q(question);
  const live = workspace.leads.filter((lead) => !lead.archivedAt);
  const now = Date.now();

  if (!query) {
    return { answer: "Ask about follow-ups, high-score prospects, sources, margin, or a specific shipper.", matches: [] };
  }

  if (/follow up|follow-up|today/.test(query) && /who|should|need|queue|this week/.test(query)) {
    const due = workspace.callbacks
      .filter((item) => item.status === "open" && Date.parse(item.dueAt) <= now + (query.includes("week") ? 7 * 86400000 : 86400000))
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    if (!due.length) return { answer: "No open follow-ups in that window.", matches: [] };
    const lines = due.map((item) => {
      const lead = live.find((row) => row.id === item.leadId);
      return `${lead?.name || "Unknown"} — ${item.reason}`;
    });
    return {
      answer: lines.join("\n"),
      matches: due.map((item) => ({ id: item.leadId, label: live.find((row) => row.id === item.leadId)?.name || item.leadId })),
    };
  }

  if (/high.?score|haven.?t been contacted|uncontacted|heavy equipment/.test(query)) {
    const rows = live.filter((lead) => {
      const scoreOk = (lead.freightScore || 0) >= (query.includes("high") ? 80 : 0);
      const heavy = !query.includes("heavy") || /heavy|forklift|excavator|bobcat|machinery/i.test(`${lead.category} ${lead.equipmentType} ${lead.listingTitle}`);
      const uncontacted = !query.includes("contact") || lead.status === "Discovered" || lead.status === "Ready to Contact";
      const stateHit = !/\btexas\b|\btx\b/.test(query) || lead.state === "TX" || /texas/i.test(lead.city);
      const fork = !/forklift/.test(query) || /forklift/i.test(`${lead.equipmentType} ${lead.listingTitle}`);
      return scoreOk && heavy && uncontacted && stateHit && fork;
    });
    if (!rows.length) return { answer: "No prospects match that filter in the current workspace.", matches: [] };
    return {
      answer: rows.map((lead) => `${lead.name} · ${companyName(lead)} · ${lead.freightScore}/100 · ${lead.status} · ${leadLocation(lead) || "—"}`).join("\n"),
      matches: rows.map((lead) => ({ id: lead.id, label: lead.name })),
    };
  }

  if (/recurring/.test(query)) {
    const rows = live.filter((lead) => lead.recurringPotential === "High" || lead.status === "Recurring Account" || (lead.tags || []).includes("recurring-candidate"));
    return {
      answer: rows.length
        ? rows.map((lead) => `${lead.name} (${companyName(lead)}) — ${lead.recurringPotential || "n/a"} · ${lead.status}`).join("\n")
        : "No recurring-shipper flags in the workspace yet.",
      matches: rows.map((lead) => ({ id: lead.id, label: lead.name })),
    };
  }

  if (/lead source|best source|sources/.test(query)) {
    const map = new Map<string, { n: number; won: number; margin: number }>();
    for (const lead of live) {
      const row = map.get(lead.source) || { n: 0, won: 0, margin: 0 };
      row.n += 1;
      if (lead.status === "Load Won" || lead.status === "Recurring Account") row.won += 1;
      map.set(lead.source, row);
    }
    for (const ship of workspace.shipments || []) {
      const lead = live.find((item) => item.id === ship.leadId);
      if (!lead) continue;
      const row = map.get(lead.source) || { n: 0, won: 0, margin: 0 };
      row.margin += shipmentMargin(ship.customerRate, ship.carrierRate);
      map.set(lead.source, row);
    }
    const lines = Array.from(map.entries())
      .sort((a, b) => b[1].n - a[1].n)
      .map(([source, row]) => `${source}: ${row.n} prospects · ${row.won} loads · ${money(row.margin)} margin`);
    return { answer: lines.join("\n") || "No source data yet.", matches: [] };
  }

  if (/gross margin|how much|this month/.test(query)) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const rows = (workspace.shipments || []).filter((item) => !["Canceled"].includes(item.status) && Date.parse(item.createdAt) >= start.getTime());
    const margin = rows.reduce((sum, item) => sum + shipmentMargin(item.customerRate, item.carrierRate), 0);
    const funnel = funnelCounts(workspace);
    return {
      answer: `${rows.length} shipments dated this month · ${money(margin)} gross margin.\nFunnel: ${funnel.discovered} prospects → ${funnel.contacted} contacted → ${funnel.replied} replied → ${funnel.quotes} quotes → ${funnel.won} loads.`,
      matches: [],
    };
  }

  if (/not shipped|30 days|accounts have not/.test(query)) {
    const cutoff = now - 30 * 86400000;
    const accounts = live.filter((lead) => lead.status === "Recurring Account" || (lead.tags || []).includes("account"));
    const stale = accounts.filter((lead) => {
      const last = (workspace.shipments || [])
        .filter((item) => item.leadId === lead.id && ["Delivered", "Paid"].includes(item.status))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
      return !last || Date.parse(last.updatedAt) < cutoff;
    });
    return {
      answer: stale.length ? stale.map((lead) => `${companyName(lead)} — no delivered load in 30 days`).join("\n") : "Every tagged account has a delivered load in the last 30 days, or none are tagged yet.",
      matches: stale.map((lead) => ({ id: lead.id, label: lead.name })),
    };
  }

  if (/write a follow-?up|follow-?up for|opener for|write .*for/.test(query)) {
    const name = query.replace(/.*\bfor\b/, "").replace(/[^a-z0-9\s]/g, "").trim();
    const lead = live.find((item) => q(item.name).includes(name) || q(companyName(item)).includes(name));
    if (!lead) return { answer: "I couldn't match that name to a prospect.", matches: [] };
    const analysis = (workspace.analyses || []).find((item) => item.leadId === lead.id);
    const msg = analysis ? generateFollowUp(lead, lead.nextAction) : generateOpeningMessage({
      leadId: lead.id,
      score: lead.freightScore || 0,
      confidence: lead.scoreConfidence || "LOW",
      why: lead.scoreWhy || "",
      freightType: lead.freightType || "Unknown",
      recurringPotential: lead.recurringPotential || "Low",
      known: [],
      estimates: [],
      unknown: [],
      openerCasual: `Hey, random question about the ${(lead.equipmentType || "item").toLowerCase()}. If somebody bought it from another state, do you already have someone you normally use to transport it?`,
      openerDirect: "",
      openerBusiness: "",
      openerShort: "",
      openerFollowUp: generateFollowUp(lead),
      analyzedAt: "",
    }, "Follow-Up");
    return { answer: msg, matches: [{ id: lead.id, label: lead.name }] };
  }

  const named = live.find((item) => query.includes(q(item.name)) || query.includes(q(companyName(item))));
  if (named && /summar|know about|tell me/.test(query)) {
    return { answer: summarizeProspect(workspace, named), matches: [{ id: named.id, label: named.name }] };
  }

  const namedAny = live.filter((item) => query.includes(q(item.name)) || query.includes(q(companyName(item))) || (item.equipmentType && query.includes(q(item.equipmentType))));
  if (namedAny.length && namedAny.length <= 8) {
    return {
      answer: namedAny.map((lead) => `${lead.name} · ${companyName(lead)} · ${lead.status} · score ${lead.freightScore ?? "—"} · ${leadLocation(lead) || "—"}`).join("\n"),
      matches: namedAny.map((lead) => ({ id: lead.id, label: lead.name })),
    };
  }

  const funnel = funnelCounts(workspace);
  return {
    answer: `I couldn't parse a specific filter. Current funnel: ${funnel.discovered} prospects, ${funnel.contacted} contacted, ${funnel.replied} replies, ${funnel.quotes} quotes, ${funnel.won} loads. Try naming a shipper or asking for today's follow-ups.`,
    matches: [],
  };
}

export function workspaceDigest(workspace: Workspace) {
  const live = workspace.leads.filter((lead) => !lead.archivedAt);
  const now = Date.now();
  const followups = workspace.callbacks
    .filter((item) => item.status === "open" && Date.parse(item.dueAt) <= now + 86400000)
    .slice(0, 8)
    .map((item) => {
      const lead = live.find((row) => row.id === item.leadId);
      return `${lead?.name || "Unknown"} | ${lead?.freightScore ?? "—"} | ${item.reason}`;
    });
  const uncontacted = live
    .filter((lead) => lead.status === "Discovered" || lead.status === "Ready to Contact")
    .sort((a, b) => (b.freightScore || 0) - (a.freightScore || 0))
    .slice(0, 10)
    .map((lead) => `${lead.name} | ${companyName(lead)} | ${lead.freightScore}/100 | ${leadLocation(lead)} | ${lead.phone || "no phone"} | ${lead.source}`);
  const shipments = (workspace.shipments || []).slice(0, 8).map((item) => `${item.customer} ${item.origin}→${item.destination} ${item.status} margin ${shipmentMargin(item.customerRate, item.carrierRate)}`);
  return [`Follow-ups today:`, ...followups, ``, `Top uncontacted:`, ...uncontacted, ``, `Shipments:`, ...shipments].join("\n");
}

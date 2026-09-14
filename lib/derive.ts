import type { Opportunity, Urgency, Workspace } from "./types";
import { CLOSED_STAGES, WON_STAGES } from "./stages";
import { daysBetween } from "./format";
import { funnelCounts, outreachQueue, shipmentMargin } from "./freight";
import { callableUncontacted } from "./metro";
import { workPath } from "./nav";

export function isOpen(stage: string) {
  return !CLOSED_STAGES.has(stage);
}

export function opportunityUrgency(opp: Opportunity, now = Date.now()): Urgency {
  if (CLOSED_STAGES.has(opp.stage)) return "healthy";
  const age = daysBetween(opp.stageEnteredAt || opp.updatedAt, now);
  const close = opp.expectedClose ? Date.parse(`${opp.expectedClose}T23:59:59`) : NaN;
  if (!opp.nextAction || age >= 14 || (Number.isFinite(close) && close < now)) return "critical";
  if (age >= 7) return "attention";
  return "healthy";
}

export function derive(workspace: Workspace, now = Date.now()) {
  const open = workspace.opportunities.filter((opp) => isOpen(opp.stage));
  const openValue = open.reduce((sum, opp) => sum + (Number(opp.value) || 0), 0);
  const weighted = open.reduce(
    (sum, opp) => sum + ((Number(opp.value) || 0) * (Number(opp.probability) || 0)) / 100,
    0,
  );
  const won = workspace.opportunities.filter((opp) => WON_STAGES.has(opp.stage));
  const wonValue = won.reduce((sum, opp) => sum + (Number(opp.value) || 0), 0);

  const archived = new Set(workspace.leads.filter((lead) => lead.archivedAt).map((lead) => lead.id));
  const dueCallbacks = workspace.callbacks.filter(
    (item) => item.status === "open" && !archived.has(item.leadId) && Date.parse(item.dueAt) <= now + 86400000,
  );
  const overdueCallbacks = workspace.callbacks.filter(
    (item) => item.status === "open" && !archived.has(item.leadId) && Date.parse(item.dueAt) < now,
  );
  const callable = workspace.leads.filter((lead) => !lead.archivedAt && !lead.dnc && (lead.status === "Discovered" || lead.status === "Ready to Contact"));

  const upcoming = workspace.appointments
    .filter((item) => !["cancelled", "completed", "no-show"].includes(item.status) && Date.parse(item.startsAt) >= now - 3600000)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const todaySits = upcoming.filter((item) => {
    const start = new Date(item.startsAt);
    const today = new Date(now);
    return start.toDateString() === today.toDateString();
  });

  const stalled = open.filter((opp) => opportunityUrgency(opp, now) === "critical");
  const attention = open.filter((opp) => opportunityUrgency(opp, now) === "attention");

  const attempts = workspace.kpiEvents.filter((event) => event.type === "dial_attempt" || event.type === "call" || event.type === "message_sent").length;
  const connected = workspace.kpiEvents.filter((event) => event.type === "connected_call" || event.type === "reply").length;
  const sets = workspace.kpiEvents.filter((event) => event.type === "appointment_set" || event.type === "quote_requested").length;
  const funnel = funnelCounts(workspace);
  const shipments = workspace.shipments || [];
  const margin = shipments.filter((item) => item.status !== "Canceled").reduce((sum, item) => sum + shipmentMargin(item.customerRate, item.carrierRate), 0);
  const messages = workspace.kpiEvents.filter((event) => event.type === "message_sent").length;
  const replies = workspace.kpiEvents.filter((event) => event.type === "reply").length;
  const quotes = (workspace.quotes || []).length;
  const loads = shipments.filter((item) => !["Quote", "Canceled"].includes(item.status)).length;
  const topProspects = [...workspace.leads]
    .filter((lead) => !lead.archivedAt)
    .sort((a, b) => (b.freightScore || 0) - (a.freightScore || 0))
    .slice(0, 8);
  const quoteRequests = workspace.leads.filter((lead) => !lead.archivedAt && /Quote/.test(lead.status));
  const interested = workspace.leads.filter((lead) => !lead.archivedAt && (lead.status === "Replied" || lead.status === "Qualified" || lead.status === "Contact Info Obtained"));
  const hotNew = [...workspace.leads]
    .filter((lead) => !lead.archivedAt && (lead.status === "Discovered" || lead.status === "Ready to Contact"))
    .sort((a, b) => (b.freightScore || 0) - (a.freightScore || 0))
    .slice(0, 6);
  const attentionShipments = shipments.filter((item) => ["Carrier Needed", "Problem", "Quote"].includes(item.status));

  return {
    open,
    openValue,
    weighted,
    wonValue,
    dueCallbacks,
    overdueCallbacks,
    callable,
    upcoming,
    todaySits,
    stalled,
    attention,
    attempts,
    connected,
    sets,
    connectRate: attempts ? Math.round((connected / attempts) * 100) : 0,
    setRate: attempts ? Math.round((sets / attempts) * 100) : 0,
    coverage: open.length ? Math.round((open.filter((opp) => opp.nextAction).length / open.length) * 100) : 0,
    funnel,
    margin,
    messages,
    replies,
    quotes,
    loads,
    topProspects,
    quoteRequests,
    interested,
    hotNew,
    attentionShipments,
  };
}

export function floorWindow(now = new Date(), window: { start?: string; end?: string } = {}) {
  const toMins = (value: string | undefined, fallback: number) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
    return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
  };
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
  };
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  const weekend = weekday === "Sat" || weekday === "Sun";
  const mins = hour * 60 + minute;
  const open = toMins(window.start, 6 * 60 + 30);
  const close = toMins(window.end, 20 * 60);
  if (weekend) return { open: false, label: "West Coast dialer closed · weekend", detail: `Next open Monday ${fmt(open)} PT` };
  if (mins >= open && mins < close) {
    const left = close - mins;
    return {
      open: true,
      label: "West Coast dialer is live",
      detail: `Closes in ${Math.floor(left / 60)}h ${left % 60}m PT`,
    };
  }
  if (mins < open) {
    const left = open - mins;
    return {
      open: false,
      label: `West Coast dialer opens ${fmt(open)} PT`,
      detail: `Opens in ${Math.floor(left / 60)}h ${left % 60}m`,
    };
  }
  return { open: false, label: "West Coast dialer closed", detail: `Opens tomorrow ${fmt(open)} PT` };
}

export function topMove(workspace: Workspace, now = Date.now()) {
  const { overdueCallbacks, dueCallbacks, stalled } = derive(workspace, now);
  const overdue = overdueCallbacks[0];
  if (overdue) {
    const lead = workspace.leads.find((item) => item.id === overdue.leadId);
    return {
      kicker: "Overdue follow-up",
      title: lead?.name || "Unknown client",
      reason: overdue.reason,
      href: "/callbacks",
      cta: "Open follow-ups",
      leadId: overdue.leadId,
    };
  }

  const callNext = callableUncontacted(workspace, 1)[0];
  if (callNext) {
    return {
      kicker: "Call — costs nothing",
      title: callNext.name,
      reason: `${callNext.phone} is on their page. Ask who books outbound freight.`,
      href: workPath(callNext.id),
      cta: "Open + call",
      leadId: callNext.id,
    };
  }

  const unlabeled = workspace.leads.find((lead) => !lead.archivedAt && !lead.label);
  if (unlabeled) {
    return {
      kicker: "Work this client",
      title: unlabeled.name,
      reason: "Label yard vs private, copy the opener, you send it. Follow-up is set when you mark sent.",
      href: workPath(unlabeled.id),
      cta: "Open",
      leadId: unlabeled.id,
    };
  }

  const nextMessage = outreachQueue(workspace.leads)[0];
  if (nextMessage) {
    return {
      kicker: "Send a message",
      title: nextMessage.name,
      reason: nextMessage.scoreWhy || "Copy the opener. You hit send on the listing or the dealer’s published number.",
      href: workPath(nextMessage.id),
      cta: "Open",
      leadId: nextMessage.id,
    };
  }

  const due = dueCallbacks[0];
  if (due) {
    const lead = workspace.leads.find((item) => item.id === due.leadId);
    return {
      kicker: "Due now",
      title: lead?.name || "Unknown client",
      reason: due.reason,
      href: "/callbacks",
      cta: "Work the queue",
      leadId: due.leadId,
    };
  }

  const waitingQuote = workspace.leads.find(
    (lead) => !lead.archivedAt && ["Replied", "Qualified", "Contact Info Obtained"].includes(lead.status),
  );
  if (waitingQuote) {
    return {
      kicker: "They engaged",
      title: waitingQuote.name,
      reason: "Quote only after you have a real rate. Leave money blank until then.",
      href: `/people?id=${waitingQuote.id}`,
      cta: "Open client",
      leadId: waitingQuote.id,
    };
  }

  const needRate = workspace.opportunities.find((item) => /Quote/.test(item.stage) && !item.value);
  if (needRate) {
    return {
      kicker: "Rate unset",
      title: needRate.name,
      reason: "A quote is open with no customer rate. Enter the number they agreed to, or leave it blank.",
      href: "/board",
      cta: "Open pipeline",
      leadId: needRate.leadId,
    };
  }

  const stall = stalled[0];
  if (stall) {
    return {
      kicker: "Stalled deal",
      title: stall.name,
      reason: stall.nextAction || "Add a next action and move it",
      href: "/board",
      cta: "Open the board",
      leadId: stall.leadId,
    };
  }

  return {
    kicker: "Hunt",
    title: "No clients waiting",
    reason: "Open a live listing, capture it, label it, then you send the message.",
    href: "/discover",
    cta: "Go to Discover",
    leadId: null as string | null,
  };
}

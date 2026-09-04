import type { Opportunity, Urgency, Workspace } from "./types";
import { CLOSED_STAGES } from "./stages";
import { daysBetween } from "./format";

export function isOpen(stage: string) {
  return !CLOSED_STAGES.has(stage) && stage !== "PTO";
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
  const won = workspace.opportunities.filter((opp) => opp.stage === "Closed Won" || opp.stage === "PTO");
  const wonValue = won.reduce((sum, opp) => sum + (Number(opp.value) || 0), 0);

  const dueCallbacks = workspace.callbacks.filter(
    (item) => item.status === "open" && Date.parse(item.dueAt) <= now + 86400000,
  );
  const overdueCallbacks = workspace.callbacks.filter(
    (item) => item.status === "open" && Date.parse(item.dueAt) < now,
  );
  const callable = workspace.leads.filter((lead) => !lead.dnc && lead.consent === "verified" && lead.phone);

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

  const attempts = workspace.kpiEvents.filter((event) => event.type === "dial_attempt").length;
  const connected = workspace.kpiEvents.filter((event) => event.type === "connected_call").length;
  const sets = workspace.kpiEvents.filter((event) => event.type === "appointment_set").length;

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
  };
}

export function floorWindow(now = new Date()) {
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
  const open = 6 * 60 + 30;
  const close = 20 * 60;
  if (weekend) return { open: false, label: "West Coast dialer closed · weekend", detail: "Next open Monday 6:30am PT" };
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
      label: "West Coast dialer opens 6:30am PT",
      detail: `Opens in ${Math.floor(left / 60)}h ${left % 60}m`,
    };
  }
  return { open: false, label: "West Coast dialer closed", detail: "Opens tomorrow 6:30am PT" };
}

export function topMove(workspace: Workspace, now = Date.now()) {
  const { overdueCallbacks, dueCallbacks, stalled, todaySits } = derive(workspace, now);
  const overdue = overdueCallbacks[0];
  if (overdue) {
    const lead = workspace.leads.find((item) => item.id === overdue.leadId);
    return {
      kicker: "Overdue callback",
      title: lead?.name || "Unknown lead",
      reason: overdue.reason,
      href: "/floor",
      cta: "Open the dialer",
      leadId: overdue.leadId,
    };
  }
  const sit = todaySits[0];
  if (sit) {
    const lead = workspace.leads.find((item) => item.id === sit.leadId);
    return {
      kicker: "Sit today",
      title: lead?.name || "Unlinked appointment",
      reason: `${sit.type} · ${sit.closer} closer`,
      href: "/floor",
      cta: "Prep the sit",
      leadId: sit.leadId,
    };
  }
  const due = dueCallbacks[0];
  if (due) {
    const lead = workspace.leads.find((item) => item.id === due.leadId);
    return {
      kicker: "Due now",
      title: lead?.name || "Unknown lead",
      reason: due.reason,
      href: "/people",
      cta: "Open the record",
      leadId: due.leadId,
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
    kicker: "Clear deck",
    title: "No overdue work",
    reason: "Pipeline is covered. Take the next inbound or raise the dial target.",
    href: "/people",
    cta: "Work the list",
    leadId: null as string | null,
  };
}

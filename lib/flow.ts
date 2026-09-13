import { callableUncontacted } from "./metro";
import { unfinishedTalked } from "./people";
import type { Workspace } from "./types";

export type FlowStepId = "hunt" | "paste" | "call" | "wrap" | "quote" | "cover" | "track";

export type FlowStep = {
  id: FlowStepId;
  n: string;
  label: string;
  count: number;
  href: string;
  hint: string;
  stay?: boolean;
  hot?: boolean;
};

export type FlowEdge = {
  from: FlowStepId;
  to: FlowStepId;
  tone: "ok" | "hot" | "idle";
};

export type FlowState = {
  steps: FlowStep[];
  edges: FlowEdge[];
  current: FlowStepId;
  line: string;
};

export type GraphPoint = { id: FlowStepId; x: number; y: number; value: number };

export const GRAPH = {
  w: 760,
  h: 248,
  l: 40,
  r: 28,
  t: 22,
  b: 44,
};

function curveControls(points: GraphPoint[], index: number) {
  const p0 = points[index - 1] || points[index];
  const p1 = points[index];
  const p2 = points[index + 1] || p1;
  const p3 = points[index + 2] || p2;
  const top = GRAPH.t;
  const floor = GRAPH.h - GRAPH.b;
  const clampY = (y: number) => Math.min(floor, Math.max(top, y));
  return {
    c1x: p1.x + (p2.x - p0.x) / 6,
    c1y: clampY(p1.y + (p2.y - p0.y) / 6),
    c2x: p2.x - (p3.x - p1.x) / 6,
    c2y: clampY(p2.y - (p3.y - p1.y) / 6),
    p1,
    p2,
  };
}

export function flowGraphPoints(steps: FlowStep[]): GraphPoint[] {
  const n = Math.max(steps.length, 1);
  const innerW = GRAPH.w - GRAPH.l - GRAPH.r;
  const innerH = GRAPH.h - GRAPH.t - GRAPH.b;
  const max = Math.max(1, ...steps.map((step) => step.count));
  return steps.map((step, index) => ({
    id: step.id,
    x: GRAPH.l + (n === 1 ? innerW / 2 : (index / (n - 1)) * innerW),
    y: GRAPH.t + innerH - (step.count / max) * innerH * 0.9,
    value: step.count,
  }));
}

export function flowCurvePath(points: GraphPoint[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const { c1x, c1y, c2x, c2y, p2 } = curveControls(points, i);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function flowAreaPath(points: GraphPoint[]) {
  const line = flowCurvePath(points);
  if (!line || points.length < 2) return "";
  const baseline = GRAPH.h - GRAPH.b;
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

export function flowSegmentPath(points: GraphPoint[], index: number) {
  if (index < 0 || index >= points.length - 1) return "";
  const { c1x, c1y, c2x, c2y, p1, p2 } = curveControls(points, index);
  return `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
}

const EDGE_PAIRS: [FlowStepId, FlowStepId][] = [
  ["hunt", "paste"],
  ["paste", "call"],
  ["call", "wrap"],
  ["wrap", "quote"],
  ["quote", "cover"],
  ["cover", "track"],
];

const COVER_STATUSES = new Set(["Carrier Needed", "Booked", "Carrier Booked"]);
const TRACK_STATUSES = new Set(["Pickup Scheduled", "In Transit"]);

export function deskFlow(workspace: Workspace, hunt: { href: string; place: string; query: string }): FlowState {
  const live = workspace.leads.filter((lead) => !lead.archivedAt);
  const callBook = callableUncontacted(workspace, 200);
  const wrap = unfinishedTalked(workspace);
  const wrapLead = wrap ? live.find((lead) => lead.id === wrap.leadId) : null;
  const quotes = (workspace.shipments || []).filter((item) => item.status === "Quote");
  const cover = (workspace.shipments || []).filter((item) => COVER_STATUSES.has(item.status) && !(item.carrierId || item.carrier.trim()));
  const track = (workspace.shipments || []).filter((item) => TRACK_STATUSES.has(item.status));
  const unlabeled = live.filter((lead) => !lead.label).length;
  const overdue = (workspace.callbacks || []).filter((item) => item.status === "open" && Date.parse(item.dueAt) < Date.now()).length;

  const current: FlowStepId = wrap
    ? "wrap"
    : overdue
      ? "call"
      : callBook.length
        ? "call"
        : unlabeled
          ? "paste"
          : quotes.length
            ? "quote"
            : cover.length
              ? "cover"
              : track.length
                ? "track"
                : "hunt";

  const steps: FlowStep[] = [
    {
      id: "hunt",
      n: "1",
      label: "Hunt",
      count: 0,
      href: hunt.href,
      hint: `Open public pages for ${hunt.query} in ${hunt.place}. Haul does not scrape them.`,
    },
    {
      id: "paste",
      n: "2",
      label: "Paste",
      count: unlabeled,
      href: "/discover?tab=paste",
      hot: unlabeled > 0,
      hint: unlabeled ? `${unlabeled} unlabeled. Paste the page, then label the yard.` : "Paste a page you already opened. Phone only if it was published.",
    },
    {
      id: "call",
      n: "3",
      label: "Call",
      count: callBook.length,
      href: "/",
      stay: true,
      hot: overdue > 0,
      hint: overdue
        ? `${overdue} follow-up${overdue === 1 ? "" : "s"} waiting. Call the published number.`
        : callBook.length
          ? `${callBook.length} untried in ${hunt.place}. Ask who books outbound freight.`
          : "Call book is empty. Hunt a metro, then paste.",
    },
    {
      id: "wrap",
      n: "4",
      label: "Wrap",
      count: wrap ? 1 : 0,
      href: "/",
      stay: true,
      hot: Boolean(wrap),
      hint: wrapLead
        ? `Stay on ${wrapLead.name}. Booker is a contact. Dest, specs, blank quote.`
        : "After they pick up, this yard stays here until a $0 quote is saved.",
    },
    {
      id: "quote",
      n: "5",
      label: "Quote",
      count: quotes.length,
      href: quotes[0] ? `/shipments?id=${encodeURIComponent(quotes[0].id)}` : "/shipments",
      hint: quotes.length ? `${quotes.length} open quote${quotes.length === 1 ? "" : "s"}. Rates stay blank until they give a number.` : "Blank quote first. Type a rate only when you quoted it.",
    },
    {
      id: "cover",
      n: "6",
      label: "Cover",
      count: cover.length,
      href: cover[0] ? `/shipments?id=${encodeURIComponent(cover[0].id)}` : "/carriers",
      hot: cover.length > 0,
      hint: cover.length ? `${cover.length} load${cover.length === 1 ? "" : "s"} need a carrier on file.` : "Paste a real MC/DOT page. Do not invent a truck.",
    },
    {
      id: "track",
      n: "7",
      label: "Track",
      count: track.length,
      href: track[0] ? `/shipments?id=${encodeURIComponent(track[0].id)}` : "/shipments",
      hint: track.length ? `${track.length} moving. Check call, then POD.` : "Tracking starts after the customer accepts and you convert the quote.",
    },
  ];

  const edges: FlowEdge[] = EDGE_PAIRS.map(([from, to]) => {
    const dest = steps.find((item) => item.id === to);
    const tone: FlowEdge["tone"] = dest?.hot ? "hot" : "ok";
    return { from, to, tone };
  });

  const now = steps.find((item) => item.id === current) || steps[0];
  const line = `${now.label} · ${now.hint}`;
  return { steps, edges, current, line };
}

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

export const FLOW_POINTS: Record<FlowStepId, { col: number; row: number }> = {
  hunt: { col: 1, row: 1 },
  paste: { col: 2, row: 1 },
  call: { col: 3, row: 1 },
  wrap: { col: 4, row: 1 },
  quote: { col: 4, row: 2 },
  cover: { col: 3, row: 2 },
  track: { col: 2, row: 2 },
};

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

  const order = steps.map((item) => item.id);
  const at = order.indexOf(current);
  const edges: FlowEdge[] = EDGE_PAIRS.map(([from, to]) => {
    const toAt = order.indexOf(to);
    const dest = steps.find((item) => item.id === to);
    let tone: FlowEdge["tone"] = "idle";
    if (toAt < at) tone = "ok";
    else if (toAt === at) tone = dest?.hot ? "hot" : "ok";
    return { from, to, tone };
  });

  const now = steps.find((item) => item.id === current) || steps[0];
  const line = `${now.label} · ${now.hint}`;
  return { steps, edges, current, line };
}

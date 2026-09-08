import { outreachQueue } from "./freight";
import { HUNT_PLAYS, huntLane, huntSearchUrl, type HuntPlay } from "./hunt";
import { callableUncontacted, densestHuntPlace } from "./metro";
import { workPath } from "./nav";
import type { Workspace } from "./types";

export type DayHunt = {
  weekday: string;
  play: HuntPlay;
  query: string;
  place: string;
  why: string;
  doThis: string;
  href: string;
  links: { id: string; name: string; url: string }[];
};

export type DeskMove = {
  kicker: string;
  title: string;
  why: string;
  href: string;
  cta: string;
};

const ROTATION: { playId: string; query: string; place: string; why: string; doThis: string }[] = [
  { playId: "people", query: "forklift dealer", place: "Dallas TX", why: "Sunday is for names, not ads. Find who books outbound at a yard you already know exists.", doThis: "Open LinkedIn people search from your login. Short note. You send it." },
  { playId: "yards", query: "forklift", place: "Dallas TX", why: "Monday: dealers and rental houses in the metros already on this book. That is the book, not Marketplace.", doThis: "Open the dealer directory and Maps. Capture yards with a published phone." },
  { playId: "listings", query: "skid steer", place: "Houston TX", why: "Tuesday: live inventory in a Texas metro you can actually call. A listing is proof something might move.", doThis: "Prefer a dealer name and a phone over a private seller." },
  { playId: "auctions", query: "mini excavator", place: "Dallas TX", why: "Wednesday: auction clock. After the hammer they have a removal deadline.", doThis: "Open Ritchie / Copart / IAA. Note lot number and pickup city." },
  { playId: "oem", query: "telehandler", place: "Fort Worth TX", why: "Thursday: OEM locators. Cat, Toyota, Bobcat, Deere already ship to customers.", doThis: "Open a locator, grab the local store phone, ask who books deliveries." },
  { playId: "rental", query: "scissor lift", place: "Houston TX", why: "Friday: rental chains. They move iron every week by design.", doThis: "Open Sunbelt / United / Maps rental. Capture the branch, not HQ." },
  { playId: "trucks", query: "dump truck", place: "Houston TX", why: "Saturday: commercial trucks. Dump and box units need a real deck guess before you talk.", doThis: "Open TruckPaper / Commercial Truck Trader. Run specs through Intel before you quote." },
];

export function todayHunt(now = new Date(), workspace?: Workspace): DayHunt {
  const row = ROTATION[now.getDay()] || ROTATION[1];
  const play = HUNT_PLAYS.find((item) => item.id === row.playId) || HUNT_PLAYS[0];
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const place = densestHuntPlace(workspace) || row.place;
  return {
    weekday,
    play,
    query: row.query,
    place,
    why: row.why,
    doThis: row.doThis,
    href: `/discover?q=${encodeURIComponent(row.query)}&place=${encodeURIComponent(place)}&play=${play.id}`,
    links: play.laneIds.slice(0, 5).map((id) => {
      const lane = huntLane(id);
      return { id, name: lane?.name || id, url: huntSearchUrl(id, row.query, place) };
    }),
  };
}

export function deskCallBook(workspace: Workspace, limit = 40) {
  return callableUncontacted(workspace, limit);
}

export function deskPlan(workspace: Workspace, now = Date.now()): DeskMove[] {
  const live = workspace.leads.filter((lead) => !lead.archivedAt);
  const unlabeled = live.find((lead) => !lead.label);
  const callNext = deskCallBook(workspace, 1)[0];
  const nextMessage = outreachQueue(live)[0];
  const overdue = workspace.callbacks
    .filter((item) => item.status === "open" && Date.parse(item.dueAt) < now)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  const hunt = todayHunt(new Date(now), workspace);
  const moves: DeskMove[] = [];

  if (overdue) {
    const person = live.find((lead) => lead.id === overdue.leadId);
    moves.push({
      kicker: "Due now",
      title: person?.name || "Follow-up",
      why: overdue.reason,
      href: "/callbacks",
      cta: "Open follow-ups",
    });
  }
  if (callNext) {
    moves.push({
      kicker: "Call — costs nothing",
      title: callNext.name,
      why: `${callNext.phone} is on their page. Ask who books outbound freight. No DAT. No ads.`,
      href: workPath(callNext.id),
      cta: "Open + call",
    });
  } else if (unlabeled) {
    moves.push({
      kicker: "Work this",
      title: unlabeled.name,
      why: "Label yard vs private, copy the opener, you send it. Follow-up is set when you mark sent.",
      href: workPath(unlabeled.id),
      cta: "Open",
    });
  } else if (nextMessage) {
    moves.push({
      kicker: "You send",
      title: nextMessage.name,
      why: nextMessage.scoreWhy || "Copy the opener. You hit send on the listing or the published number.",
      href: workPath(nextMessage.id),
      cta: "Open",
    });
  }
  if (moves.length < 3) {
    moves.push({
      kicker: `${hunt.weekday} hunt`,
      title: `${hunt.play.title} · ${hunt.query} · ${hunt.place}`,
      why: hunt.doThis,
      href: hunt.href,
      cta: "Open Discover",
    });
  }
  if (moves.length < 3) {
    moves.push({
      kicker: "Before you quote",
      title: "Check the deck in Intel",
      why: "Enter L × W × H and pounds. If hotshot fails, you will see why.",
      href: "/playbook",
      cta: "Open Intel",
    });
  }
  if (moves.length < 3) {
    moves.push({
      kicker: "Capture",
      title: "Paste a listing you already opened",
      why: "No API. Copy what is on the page. Phone only if it was published.",
      href: "/discover?tab=paste",
      cta: "Paste listing",
    });
  }
  return moves.slice(0, 3);
}

export const START_CONNECTIONS = [
  {
    name: "No API to buy",
    need: "None",
    detail: "Move' does not connect to Facebook, DAT, Machinery Trader, or Maps as an integration. Open is a normal browser tab. That is enough to start today.",
  },
  {
    name: "This computer",
    need: "Have it",
    detail: "localhost:6793. Clients stay here. No custom domain.",
  },
  {
    name: "Facebook",
    need: "Your login",
    detail: "Only if you hunt Marketplace. Use your real profile. Not an API key.",
  },
  {
    name: "LinkedIn",
    need: "Your login",
    detail: "For people at yards. You run the search. Move' does not log in.",
  },
  {
    name: "Ollama",
    need: "Optional",
    detail: "Local scoring when you paste. Rules still work if it is off. qwen3-coder:30b if you want it.",
  },
  {
    name: "DAT / Truckstop",
    need: "Optional paid",
    detail: "Their website, your account, for empty miles. We never scrape the board. Skip until you have yards.",
  },
];

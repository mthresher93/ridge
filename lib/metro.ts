import { isCallablePhone } from "./carriers";
import type { Lead, Workspace } from "./types";
import { looksLikeYardName } from "./yard";

export type Metro = {
  id: string;
  label: string;
  hunt: string;
  match: RegExp;
};

export const METROS: Metro[] = [
  { id: "dallas", label: "Dallas", hunt: "Dallas TX", match: /\bdallas\b|\birving\b|\bplano\b|\bgarland\b|\bmesquite\b|\bcarrollton\b|\bmckinney\b|\baddison\b|\brichardson\b|\bfrisco\b/i },
  { id: "fortworth", label: "Fort Worth", hunt: "Fort Worth TX", match: /\bfort worth\b|\bft\.?\s*worth\b|\bsaginaw\b|\barlington\b|\bburleson\b|\bhaslet\b/i },
  { id: "houston", label: "Houston", hunt: "Houston TX", match: /\bhouston\b|\balvin\b|\bpasadena\b|\bpearland\b|\bsugar land\b|\bcypress\b|\bkaty\b|\bconroe\b/i },
  { id: "austin", label: "Austin", hunt: "Austin TX", match: /\baustin\b|\bround rock\b|\bbuda\b|\bpflugerville\b|\bcedar park\b|\bgeorgetown\b/i },
  { id: "sanantonio", label: "San Antonio", hunt: "San Antonio TX", match: /\bsan antonio\b|\bnew braunfels\b|\bschertz\b/i },
  { id: "waco", label: "Waco", hunt: "Waco TX", match: /\bwaco\b|\bhewitt\b|\btemple\b|\bkilleen\b/i },
  { id: "east", label: "East Texas", hunt: "Tyler TX", match: /\btyler\b|\blongview\b|\blufkin\b|\bnacogdoches\b/i },
  { id: "west", label: "West Texas", hunt: "Odessa TX", match: /\bodessa\b|\bmidland\b|\blubbock\b|\bamarillo\b|\bel paso\b/i },
  { id: "valley", label: "South Texas", hunt: "Laredo TX", match: /\blaredo\b|\bmcallen\b|\bpharr\b|\bcorpus\b|\bvictoria\b/i },
];

export const HUNT_HOME_MARKETS = METROS.map((item) => item.hunt);

const UNCONTACTED = new Set(["Discovered", "Ready to Contact"]);

export function metroOf(lead: { city?: string; state?: string; name?: string }): Metro | null {
  const hay = [lead.city, lead.state, lead.name].filter(Boolean).join(" ");
  return METROS.find((item) => item.match.test(hay)) || null;
}

export function metroFromPlace(place: string): Metro | null {
  const hay = String(place || "");
  if (!hay.trim()) return null;
  return METROS.find((item) => item.match.test(hay) || hay.toLowerCase().includes(item.label.toLowerCase())) || null;
}

export function prospectRank(lead: Lead) {
  let n = lead.freightScore || 0;
  const callable = isCallablePhone(lead.phone);
  const yard = lead.label === "Dealer" || lead.label === "Rental" || looksLikeYardName([lead.name, lead.company].filter(Boolean).join(" "));
  if (callable) n += 400;
  if (UNCONTACTED.has(lead.status)) n += 80;
  if (yard) n += 90;
  if (!lead.label && callable) n += 50;
  n -= (lead.attempts || 0) * 90;
  if ((lead.tags || []).includes("wrong-number")) n -= 250;
  return n;
}

export function workQueue(leads: Lead[]) {
  return leads
    .filter((lead) => !lead.archivedAt && (UNCONTACTED.has(lead.status) || lead.status === "Contacted"))
    .sort((a, b) => prospectRank(b) - prospectRank(a) || a.name.localeCompare(b.name));
}

export function callableUncontacted(workspace: Workspace, limit = 80) {
  return workspace.leads
    .filter((lead) => !lead.archivedAt && isCallablePhone(lead.phone) && UNCONTACTED.has(lead.status))
    .sort((a, b) => prospectRank(b) - prospectRank(a) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function groupByMetro(leads: Lead[]) {
  const map = new Map<string, Lead[]>();
  for (const lead of leads) {
    const key = metroOf(lead)?.id || "other";
    const list = map.get(key) || [];
    list.push(lead);
    map.set(key, list);
  }
  const groups: { id: string; label: string; hunt: string; leads: Lead[] }[] = [];
  for (const metro of METROS) {
    const list = map.get(metro.id);
    if (list?.length) groups.push({ id: metro.id, label: metro.label, hunt: metro.hunt, leads: list });
  }
  const other = map.get("other");
  if (other?.length) groups.push({ id: "other", label: "Other", hunt: "", leads: other });
  return groups;
}

export function leadsInPlace(leads: Lead[], place: string) {
  const live = leads.filter((lead) => !lead.archivedAt);
  const metro = metroFromPlace(place);
  if (metro) return live.filter((lead) => metroOf(lead)?.id === metro.id);
  if (/\btx\b|texas/i.test(place)) return live.filter((lead) => metroOf(lead) || /\btx\b|texas/i.test([lead.city, lead.state].join(" ")));
  const needle = place.trim().toLowerCase();
  if (!needle) return [];
  return live.filter((lead) => [lead.city, lead.state, lead.name].join(" ").toLowerCase().includes(needle));
}

export function huntPlacesFromBook(workspace: Workspace) {
  const counts = new Map<string, number>();
  for (const lead of callableUncontacted(workspace, 200)) {
    const metro = metroOf(lead);
    if (!metro) continue;
    counts.set(metro.hunt, (counts.get(metro.hunt) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([place]) => place);
  return [...new Set([...ranked, ...HUNT_HOME_MARKETS])];
}

export function densestHuntPlace(workspace?: Workspace) {
  if (!workspace) return "";
  return huntPlacesFromBook(workspace)[0] || "";
}

export function sameMetroQueue(leads: Lead[], lead: Lead, limit = 6) {
  const metro = metroOf(lead);
  return workQueue(leads)
    .filter((item) => item.id !== lead.id && (!metro || metroOf(item)?.id === metro.id))
    .slice(0, limit);
}

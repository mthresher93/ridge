import { isCallablePhone } from "./carriers";
import { groupByMetro } from "./metro";
import type { Lead } from "./types";

export function bookCensus(leads: Lead[]) {
  const live = leads.filter((lead) => !lead.archivedAt);
  const bySource = new Map<string, number>();
  const byLabel = new Map<string, number>();
  for (const lead of live) {
    const source = lead.source?.trim() || "Unknown";
    bySource.set(source, (bySource.get(source) || 0) + 1);
    const label = lead.label || "Unlabeled";
    byLabel.set(label, (byLabel.get(label) || 0) + 1);
  }
  const sources = [...bySource.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const labels = [...byLabel.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const sellers = live.filter(
    (lead) =>
      lead.label === "Private seller" ||
      /\b(facebook marketplace|craigslist|offerup|ebay)\b/i.test(lead.source || ""),
  );
  const yards = live.filter((lead) => lead.label === "Dealer" || lead.label === "Rental" || lead.label === "Shipper");
  return {
    live: live.length,
    withPhone: live.filter((lead) => isCallablePhone(lead.phone)).length,
    unlabeled: live.filter((lead) => !lead.label).length,
    sources,
    labels,
    metros: groupByMetro(live).map((group) => ({ id: group.id, label: group.label, count: group.leads.length })),
    sellers: sellers.length,
    yards: yards.length,
  };
}

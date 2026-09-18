import { isCallablePhone } from "./carriers";
import { callableUncontacted, METROS, metroOf } from "./metro";
import { looksLikeYardName } from "./yard";
import type { Callback, Carrier, Lead, Shipment, Workspace } from "./types";

export const DESK_CITIES = METROS.map((item) => ({ id: item.id, label: item.label, hunt: item.hunt }));

export function cityQueries(cityLabel: string) {
  const city = cityLabel.replace(/\s+TX$/i, "").trim();
  return [
    `forklift dealer ${city} TX`,
    `equipment rental ${city} TX`,
    `skid steer dealer ${city} TX`,
  ];
}

export function googleHuntUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function osmHuntUrl(query: string, place: string) {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${query} ${place}`)}`;
}

export const DESK_LOCATORS: { name: string; url: (place: string) => string }[] = [
  { name: "Toyota / Doggett", url: () => "https://www.toyotaforklift.com/find-a-dealer" },
  { name: "Cat / Holt", url: (place) => `https://www.cat.com/en_US/support/dealer-locator.html#q=${encodeURIComponent(place)}` },
  { name: "Texas First Rentals", url: () => "https://www.texasfirstrentals.com/locations/" },
  { name: "Kirby-Smith", url: () => "https://www.kirby-smith.com/locations/" },
  { name: "United Rentals", url: () => "https://www.unitedrentals.com/locations" },
  { name: "Sunbelt", url: () => "https://www.sunbeltrentals.com/locations/" },
  { name: "Herc", url: () => "https://www.hercrentals.com/locations.html" },
];

export function isPublishedPhone(value: string) {
  return isCallablePhone(value);
}

export function isTexasPlace(city: string, state = "") {
  const hay = `${city} ${state}`;
  if (!city.trim()) return false;
  if (/\bTX\b|\btexas\b/i.test(hay)) return true;
  return Boolean(metroOf({ city, state }));
}

export function clientSaveError(input: { name?: string; city?: string; state?: string; phone?: string; location?: string }) {
  const name = (input.name || "").trim();
  const city = (input.city || "").trim() || (input.location || "").split(",")[0]?.trim() || "";
  const state = (input.state || "").trim() || (/\btx\b|texas/i.test(input.location || "") ? "TX" : "");
  if (!name) return "Need a business name from the page.";
  if (!isTexasPlace(city, state) && !isTexasPlace(input.location || "", "")) return "Need a Texas city.";
  if (!isPublishedPhone(input.phone || "")) return "Need a published 10-digit phone. No 555 numbers.";
  return null;
}

export function carrierSaveError(input: { mc?: string; dot?: string; phone?: string; name?: string }) {
  if (!String(input.mc || "").trim()) return "Need an MC from the page.";
  if (!String(input.dot || "").trim()) return "Need a DOT from the page.";
  if (!isPublishedPhone(input.phone || "")) return "Need a dispatch phone from the page.";
  return null;
}

export function followUpSaveError(input: { personName?: string; reason?: string }) {
  if (!String(input.personName || "").trim()) return "Follow-ups are for named humans. Get a booker name first.";
  if (!String(input.reason || "").trim()) return "Need a reason, like “Asked me to check Monday.”";
  return null;
}

export function captureScore(input: { phone?: string; city?: string; state?: string; address?: string; name?: string }) {
  let n = 0;
  if (isPublishedPhone(input.phone || "")) n += 50;
  if ((input.address || "").trim() || ((input.city || "").trim() && (input.state || "").trim())) n += 25;
  if (looksLikeYardName([input.name, input.address].filter(Boolean).join(" "))) n += 25;
  return n;
}

function hay(value: string) {
  return value.toLowerCase();
}

export function isDemoLead(lead: Lead) {
  const blob = hay([lead.name, lead.company, lead.phone, lead.listingUrl, lead.website, lead.sellerUrl, lead.email].join(" "));
  const digits = String(lead.phone || "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length === 10 && ten.slice(3, 6) === "555") return true;
  return /westside machinery|example\.com|\.example\b/.test(blob);
}

export function isDemoCarrier(carrier: Carrier) {
  const blob = hay([carrier.name, carrier.mc, carrier.dot, carrier.phone, carrier.sourceUrl].join(" "));
  return /desert hotshot|example\.com/.test(blob) || carrier.mc === "123456" || carrier.dot === "987654";
}

export function isDemoShipment(shipment: Shipment) {
  const blob = hay([shipment.customer, shipment.carrier, shipment.reference, shipment.notes, shipment.loadNumber].join(" "));
  return /persistence check|desert hotshot|example\.com/.test(blob);
}

export function isDemoCallback(item: Callback, leads: Lead[]) {
  const lead = leads.find((row) => row.id === item.leadId);
  if (!lead || lead.archivedAt || isDemoLead(lead)) return true;
  const person = (lead.booker || "").trim();
  if (!person) return true;
  return /example\.com|555/.test(hay(item.reason || ""));
}

export function deskColumn(lead: Lead, workspace: Workspace): "hunt" | "talk" | "quote" | "cover" {
  const covered = (workspace.shipments || []).some(
    (item) => item.leadId === lead.id && Boolean(item.carrierId || item.carrier.trim()) && !["Quote", "Canceled"].includes(item.status),
  );
  if (covered) return "cover";
  if (lead.status === "Quote Requested" || lead.status === "Quote Sent" || lead.status === "Negotiating") return "quote";
  if ((workspace.shipments || []).some((item) => item.leadId === lead.id && item.status === "Quote")) return "quote";
  if (lead.status === "Contacted" || lead.status === "Replied" || lead.status === "Qualified" || lead.status === "Contact Info Obtained") return "talk";
  return "hunt";
}

function startOfDay(offset = 0, now = Date.now()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.getTime();
}

function inRange(at: string | undefined, from: number, to: number) {
  const n = Date.parse(at || "");
  return Number.isFinite(n) && n >= from && n < to;
}

export function todayStrip(workspace: Workspace, now = Date.now()) {
  const live = workspace.leads.filter((lead) => !lead.archivedAt && !isDemoLead(lead));
  const day0 = startOfDay(0, now);
  const day1 = startOfDay(1, now);
  const ready = callableUncontacted({ ...workspace, leads: live }, 200);
  const calledToday = live.filter((lead) => inRange(lead.lastContactAt, day0, day1)).length;
  const namedBooker = live.filter((lead) => (lead.booker || "").trim() && inRange(lead.updatedAt, day0, day1)).length;
  const quoteRequested = live.filter((lead) => lead.status === "Quote Requested" || inRange(lead.updatedAt, day0, day1) && /quote/i.test(lead.status)).length;
  const openQuotes = (workspace.shipments || []).filter((item) => item.status === "Quote" && !isDemoShipment(item)).length;
  const loadLive = (workspace.shipments || []).filter(
    (item) => !isDemoShipment(item) && !["Quote", "Canceled", "Delivered", "Paid"].includes(item.status),
  ).length;
  return {
    ready: ready.length,
    calledToday,
    namedBooker,
    quoteRequested: quoteRequested || openQuotes,
    loadLive,
    nextCalls: ready.slice(0, 3),
  };
}

export function weekCounts(workspace: Workspace, now = Date.now()) {
  const from = startOfDay(-6, now);
  const to = startOfDay(1, now);
  const liveIds = new Set(workspace.leads.filter((lead) => !lead.archivedAt && !isDemoLead(lead)).map((lead) => lead.id));
  const hunts = (workspace.listings || []).filter((item) => liveIds.has(item.leadId) && inRange(item.discoveredAt, from, to)).length;
  const voicemails = (workspace.callLogs || []).filter((item) => item.outcome === "voicemail" && inRange(item.at, from, to)).length;
  const talks = (workspace.callLogs || []).filter((item) => item.outcome === "connected" && inRange(item.at, from, to)).length
    || workspace.leads.filter((lead) => !lead.archivedAt && lead.status !== "Discovered" && lead.status !== "Ready to Contact" && inRange(lead.lastContactAt, from, to)).length;
  return { hunts, pastes: hunts, voicemails, talks };
}

export function callReason(lead: Lead) {
  if ((lead.attempts || 0) === 0) return "Never tried";
  if (lead.status === "Discovered" || lead.status === "Ready to Contact") return "Open now";
  if (lead.label === "Rental") return "Rental";
  if (lead.label === "Dealer") return "Dealer";
  return lead.nextAction || lead.label || "Open now";
}

export function yardOpener(lead: Lead, operator = "Michael") {
  const city = lead.city || metroOf(lead)?.label || "Texas";
  const address = lead.address || [lead.city, lead.state].filter(Boolean).join(", ") || city;
  return `${city} — ${operator}. Quick one on outbound freight at ${address}. Who books the truck when a machine sells?`;
}

export function purgeWorkspace(workspace: Workspace): Workspace {
  const leads = workspace.leads.filter((lead) => !isDemoLead(lead));
  const liveIds = new Set(leads.filter((lead) => !lead.archivedAt).map((lead) => lead.id));
  const carriers = (workspace.carriers || []).filter((item) => !isDemoCarrier(item) && !carrierSaveError(item));
  const carrierIds = new Set(carriers.map((item) => item.id));
  const shipments = (workspace.shipments || []).filter((item) => {
    if (isDemoShipment(item)) return false;
    if (item.carrierId && !carrierIds.has(item.carrierId) && /desert hotshot/i.test(item.carrier || "")) return false;
    return true;
  });
  const callbacks = (workspace.callbacks || []).filter((item) => !isDemoCallback(item, leads) && liveIds.has(item.leadId));
  return {
    ...workspace,
    leads,
    carriers,
    shipments: shipments.map((item) =>
      item.carrierId && !carrierIds.has(item.carrierId)
        ? { ...item, carrierId: "", carrier: item.carrier && !/desert hotshot/i.test(item.carrier) ? item.carrier : "" }
        : item,
    ),
    callbacks,
    listings: (workspace.listings || []).filter((item) => liveIds.has(item.leadId)),
    contacts: (workspace.contacts || []).filter((item) => liveIds.has(item.leadId)),
    settings: {
      ...workspace.settings,
      operator: workspace.settings.operator || "Michael",
      defaultOwner: workspace.settings.defaultOwner || "Michael",
    },
    opportunities: (workspace.opportunities || []).filter((item) => Boolean(item.leadId && liveIds.has(item.leadId))),
  };
}

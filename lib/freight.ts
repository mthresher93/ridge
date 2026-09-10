import type {
  CargoUnit,
  Company,
  FreightAnalysis,
  FreightType,
  Lead,
  Listing,
  RecurringPotential,
  ScoreConfidence,
  Shipment,
  ShipperRole,
  Workspace,
} from "./types";
import { CONTACTED_STAGES, PHONE_STAGES, QUALIFIED_STAGES, QUOTE_STAGES, REPLIED_STAGES, UNCONTACTED_STAGES, WON_STAGES } from "./stages";
import { normalizePhone, nowIso, uid } from "./format";
import { parseDimensions, parsePounds, recommendEquipment } from "./equipment";
import { looksLikeYardName } from "./yard";
import { workQueue } from "./metro";
import { variantIndex } from "./pacing";
import { isCallablePhone } from "./carriers";

export const LEAD_SOURCES = [
  "Facebook Marketplace",
  "Craigslist",
  "Machinery Trader",
  "Equipment Trader",
  "TractorHouse",
  "Auction",
  "Referral",
  "Cold List",
  "Google",
  "Manual",
  "CSV",
  "Capture",
  "OfferUp",
  "eBay",
  "OpenStreetMap",
  "Other",
] as const;

export const MESSAGE_STYLES = ["Casual", "Direct", "Business", "Very Short", "Follow-Up"] as const;
export type MessageStyle = (typeof MESSAGE_STYLES)[number];
export const CLIENT_KINDS = ["Unlabeled", "Dealer", "Private seller", "Auction", "Rental", "Shipper", "Other"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export function suggestClientKind(input: { source?: string; sellerName?: string; title?: string; description?: string; website?: string }): Exclude<ClientKind, "Unlabeled"> | "" {
  const source = (input.source || "").toLowerCase();
  const seller = (input.sellerName || "").toLowerCase();
  const hay = [source, seller, input.title, input.description, input.website].filter(Boolean).join(" ").toLowerCase();
  if (/\b(ritchie|ironplanet|auction|govdeals|purple wave)\b/.test(hay)) return "Auction";
  if (/\brental/.test(hay)) return "Rental";
  if (/\b(dealer|dealership)\b/.test(hay) || /\b(llc|inc|ltd|corp)\b/.test(seller) || looksLikeYardName(input.sellerName || "") || looksLikeYardName(input.website || "")) return "Dealer";
  if (/\b(facebook marketplace|craigslist|offerup|ebay)\b/.test(source) && !/\b(llc|inc|dealer)\b/.test(seller) && !looksLikeYardName(input.sellerName || "")) return "Private seller";
  return "";
}

export type CapturePayload = {
  source?: string;
  url?: string;
  title?: string;
  description?: string;
  price?: number | string | null;
  location?: string;
  city?: string;
  state?: string;
  sellerName?: string;
  sellerUrl?: string;
  pageText?: string;
  phone?: string;
  email?: string;
  website?: string;
  category?: string;
  equipmentType?: string;
  dimensions?: string;
  weight?: string;
  quantity?: number | string | null;
  pickupLocation?: string;
  destination?: string;
  notes?: string;
  owner?: string;
};

export type ExtractedListing = {
  title: string;
  description: string;
  source: string;
  sourceUrl: string;
  sellerName: string;
  sellerUrl: string;
  city: string;
  state: string;
  askingPrice: number | null;
  category: string;
  equipmentType: string;
  dimensions: string;
  weight: string;
  quantity: number | null;
  pickupLocation: string;
  destination: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
};

const HEAVY = /\b(forklift|excavator|bobcat|skid\s*steer|loader|backhoe|tractor|dozer|bulldozer|crane|telehandler|grader|paver|scissor\s*lift|boom\s*lift|man\s*lift|generator|air\s*compressor|cnc|lathe|mill|press\s*brake|laser\s*cutter|plasma|injection\s*mold|pallet\s*jack|palletizer|conveyor|semi|dump\s*truck|roll\s*off|scissor|welder|compressor|machinery|heavy\s*equipment|industrial)\b/i;
const VEHICLE = /\b(motorcycle|motorbike|\bcar\b|pickup\s*truck|suv|van|rv|camper|atv|utv|boat|jet\s*ski|car hauler|enclosed trailer|utility trailer|gooseneck|equipment trailer)\b/i;
const COMMERCIAL = /\b(restaurant|walk-?in|fryer|oven|cooler|ice\s*machine|commercial|dealer|dealership|warehouse|inventory)\b/i;
const HOUSEHOLD = /\b(sofa|couch|mattress|dresser|clothing|clothes|iphone|ipad|playstation|xbox|nintendo|lamp|tv\s*stand|coffee\s*table|stroller|crib|toy)\b/i;
const SHIPPING = /\b(ship|shipping|delivery|freight|transport|out\s*of\s*state|nationwide|can\s*deliver)\b/i;
const DEALER = /\b(dealer|dealership|llc|inc\.?|equipment\s*co|machinery|rental|auction|yard|branch)\b/i;
const INTERSTATE = /\b(out\s*of\s*state|nationwide|will\s*ship|can\s*ship|buyer\s*pays\s*shipping)\b/i;
const YARD = /\b(dealer|dealership|rental|llc|inc\.?|ltd|corp|equipment\s*co|machinery|auction|yard|inventory|forklift\s*sales|material handling)\b/i;

export function detectShipperRole(input: {
  source?: string;
  sellerName?: string;
  title?: string;
  description?: string;
}): ShipperRole {
  const source = (input.source || "").toLowerCase();
  const hay = [input.sellerName, input.title, input.description, source].filter(Boolean).join(" ").toLowerCase();
  if (/\b(ritchie|ironplanet|auction|govdeals|purple wave|copart|iaa|manheim)\b/.test(hay) || source.includes("auction")) return "Auction";
  if (/\brental/.test(hay) || looksLikeYardName(input.sellerName || "") || YARD.test(hay)) return "Yard";
  if (/\b(facebook marketplace|craigslist)\b/.test(source) && !YARD.test(input.sellerName || "") && !looksLikeYardName(input.sellerName || "")) return "Private";
  if (YARD.test(hay)) return "Yard";
  return "Unknown";
}

export function companyName(lead: Lead) {
  return (lead.company || lead.property || "").trim();
}

export function leadLocation(lead: Lead) {
  return [lead.city, lead.state].filter(Boolean).join(", ");
}

export function hasMeasuredSpecs(lead: { dimensions?: string | null; weight?: string | null }) {
  return Boolean(String(lead.dimensions || "").trim() || String(lead.weight || "").trim());
}

export function trailerFact(lead: { dimensions?: string | null; weight?: string | null; trailerHint?: string | null }, unset = "Ask on the call") {
  if (!hasMeasuredSpecs(lead)) return unset;
  return lead.trailerHint || unset;
}

export function shipmentMargin(customerRate: number, carrierRate: number) {
  return (Number(customerRate) || 0) - (Number(carrierRate) || 0);
}

function cargoUnitsFromLead(lead: Lead): CargoUnit[] {
  const parsed = parseDimensions(lead.dimensions || "");
  const weightLbs = parsePounds(lead.weight);
  if (parsed.lengthFt == null && weightLbs == null) return [];
  return [
    {
      id: uid("cu"),
      qty: 1,
      lengthFt: parsed.lengthFt,
      widthFt: parsed.widthFt,
      heightFt: parsed.heightFt,
      weightLbs,
      notes: lead.listingTitle || lead.equipmentType || "",
    },
  ];
}

export function blankLoadFromLead(
  lead: Lead,
  overlay: { destination?: string; contact?: string; carrier?: string; carrierId?: string } = {},
): Omit<Shipment, "id" | "createdAt" | "updatedAt"> {
  return {
    leadId: lead.id,
    customer: companyName(lead) || lead.name,
    contact: overlay.contact?.trim() || lead.booker || lead.name,
    origin: lead.origin || leadLocation(lead) || "",
    destination: String(overlay.destination ?? lead.destination ?? "").trim(),
    pickupDate: "",
    deliveryDate: "",
    commodity: lead.listingTitle || lead.equipmentType || "",
    weight: lead.weight || "",
    dimensions: lead.dimensions || "",
    equipmentType: lead.trailerHint || lead.equipmentType || "",
    carrier: overlay.carrier || "",
    carrierId: overlay.carrierId || "",
    carrierRate: 0,
    customerRate: 0,
    status: "Quote",
    reference: "",
    notes: "",
    loadNumber: "",
    podReceived: false,
    tracking: [],
    cargoUnits: cargoUnitsFromLead(lead),
    pickupNotes: "",
    destNotes: "",
    appointmentPickup: false,
  };
}

export function openQuoteShipment(workspace: Workspace, leadId: string) {
  return (workspace.shipments || []).find((item) => item.leadId === leadId && item.status === "Quote") || null;
}

export function upsertBlankQuote(workspace: Workspace, lead: Lead, overlay: { destination?: string; contact?: string } = {}) {
  const stamp = nowIso();
  const existing = openQuoteShipment(workspace, lead.id);
  const blank = blankLoadFromLead(lead, overlay);
  const shipment: Shipment = existing
    ? {
        ...existing,
        ...blank,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: stamp,
        customerRate: existing.customerRate || 0,
        carrierRate: existing.carrierRate || 0,
        carrier: existing.carrier,
        carrierId: existing.carrierId,
        pickupDate: existing.pickupDate,
        deliveryDate: existing.deliveryDate,
        notes: existing.notes,
        reference: existing.reference,
        loadNumber: existing.loadNumber,
        podReceived: existing.podReceived,
        tracking: existing.tracking,
        cargoUnits: existing.cargoUnits,
        pickupNotes: existing.pickupNotes,
        destNotes: existing.destNotes,
        appointmentPickup: existing.appointmentPickup,
      }
    : { ...blank, id: uid("shp"), createdAt: stamp, updatedAt: stamp };
  const keepStage = (status: string) => QUOTE_STAGES.has(status) || WON_STAGES.has(status) || status === "Load Lost";
  return {
    shipment,
    created: !existing,
    workspace: {
      ...workspace,
      shipments: existing
        ? (workspace.shipments || []).map((row) => (row.id === shipment.id ? shipment : row))
        : [shipment, ...(workspace.shipments || [])],
      leads: workspace.leads.map((row) =>
        row.id === lead.id
          ? {
              ...row,
              destination: shipment.destination || row.destination,
              nextAction: "Blank quote open. Rates stay 0 until they give a number.",
              status: keepStage(row.status) ? row.status : "Quote Requested",
              updatedAt: stamp,
            }
          : row,
      ),
      opportunities: workspace.opportunities.map((item) =>
        item.leadId === lead.id
          ? {
              ...item,
              origin: shipment.origin,
              destination: shipment.destination,
              stage: keepStage(item.stage) ? item.stage : "Quote Requested",
              updatedAt: stamp,
            }
          : item,
      ),
      updatedAt: stamp,
    },
  };
}

export function sourceFromUrl(url: string) {
  const host = url.toLowerCase();
  if (host.includes("facebook") || host.includes("fb.com") || host.includes("marketplace")) return "Facebook Marketplace";
  if (host.includes("craigslist")) return "Craigslist";
  if (host.includes("machinerytrader")) return "Machinery Trader";
  if (host.includes("equipmenttrader")) return "Equipment Trader";
  if (host.includes("tractorhouse")) return "TractorHouse";
  if (host.includes("rbauction") || host.includes("ritchiebros") || host.includes("ironplanet") || host.includes("auction") || host.includes("govdeals") || host.includes("copart") || host.includes("iaai") || host.includes("purplewave")) return "Auction";
  if (host.includes("google") || host.includes("maps") || host.includes("cat.com") || host.includes("bobcat.com") || host.includes("deere.com") || host.includes("sunbelt") || host.includes("unitedrentals")) return "Google";
  if (url.trim()) return "Google";
  return "Manual";
}

const US_STATES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));

function parsePrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "").trim();
  if (!text) return null;
  const dollar = text.replace(/,/g, "").match(/\$\s*(\d+(?:\.\d+)?)/);
  if (dollar) {
    const n = Number(dollar[1]);
    return Number.isFinite(n) ? n : null;
  }
  if (/^[\d,]+(?:\.\d+)?$/.test(text)) {
    const n = Number(text.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseListingPrice(blob: string) {
  const text = String(blob || "").replace(/,/g, "");
  const match = text.match(/(?:asking(?:\s*price)?|price)\s*:?\s*\$?\s*(\d+(?:\.\d+)?)|\$\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const n = Number(match[1] || match[2]);
  return Number.isFinite(n) ? n : null;
}

function parsePlace(location: string, city = "", state = "") {
  const text = location.trim();
  const match = text.match(/^([^,]+),\s*([A-Z]{2})\b/i);
  if (match) return { city: city || match[1].trim(), state: (state || match[2]).toUpperCase() };
  const st = text.match(/\b([A-Z]{2})\b/);
  return { city: city || text.replace(/\b[A-Z]{2}\b/, "").replace(/,/g, "").trim(), state: state || (st ? st[1].toUpperCase() : "") };
}

function extractPlaceFromText(text: string) {
  for (const line of String(text || "").split(/\n+/)) {
    const located = line.match(/\b(?:located in|pickup(?:\s+in)?)\s+([A-Z][a-zA-Z .']+),\s*([A-Z]{2})\b/i);
    const withZip = line.match(/\b([A-Z][a-zA-Z.'-]+(?:[ ][A-Z][a-zA-Z.'-]+)*),\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
    const pair = line.match(/\b([A-Z][a-zA-Z.'-]+(?:[ ][A-Z][a-zA-Z.'-]+)*),\s*([A-Z]{2})\b/);
    const match = located || withZip || pair;
    if (!match) continue;
    const st = match[2].toUpperCase();
    if (!US_STATES.has(st)) continue;
    const city = match[1].trim().replace(/^(located in|pickup(?:\s+in)?)\s+/i, "");
    if (!city || city.split(/\s+/).length > 4) continue;
    if (/\b(llc|inc|ltd|corp)\b/i.test(city)) continue;
    return { city, state: st };
  }
  return { city: "", state: "" };
}

function extractPublishedPhone(given: string, blob: string) {
  if (given.trim() && isCallablePhone(given)) return given.trim();
  const tel = blob.match(/tel:\+?1?(\d{10})/i);
  if (tel && isCallablePhone(tel[1])) {
    const d = tel[1];
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  const stripped = blob.replace(/\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?/gi, " ");
  const matches = stripped.matchAll(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g);
  for (const hit of matches) {
    if (!isCallablePhone(hit[0])) continue;
    return hit[0];
  }
  return "";
}

function cleanSeller(value: string) {
  const name = value.replace(/\s+/g, " ").replace(/[|•].*$/, "").trim();
  if (name.length < 3 || name.length > 80) return "";
  if (/ago|hour|minute|yesterday|today|for sale/i.test(name)) return "";
  return name.slice(0, 80);
}

function looksLikeMapsChrome(line: string) {
  return (
    /^(directions|website|save|share|call|hours|open|closed|claim this|united states|suggest an edit|menu|overview|reviews|about)\b/i.test(line) ||
    /^\d\.\d\b/.test(line) ||
    /^\(\d[\d,]+\)$/.test(line) ||
    /^\d+\s+reviews?$/i.test(line)
  );
}

function looksLikeStreetAddress(line: string) {
  return /^\d{1,6}\s+\S+/.test(line) && /\b(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|hwy|pkwy|ct|way|suite|ste)\b/i.test(line);
}

function extractMapsBusiness(blob: string) {
  const lines = blob.split(/\n+/).map((line) => line.trim().replace(/\s+/g, " ")).filter(Boolean);
  for (const line of lines) {
    if (looksLikeMapsChrome(line) || looksLikeStreetAddress(line)) continue;
    if (extractPublishedPhone("", line)) continue;
    if (/\b[A-Z]{2}\s+\d{5}\b/.test(line) || /^[A-Z][a-zA-Z.'-]+(?:[ ][A-Z][a-zA-Z.'-]+)*,\s*[A-Z]{2}\b/.test(line)) continue;
    if (/https?:|www\./i.test(line) || /\.(com|net|org|biz)\b/i.test(line)) continue;
    if (line.length < 3 || line.length > 70) continue;
    if (/^(forklift|skid steer|excavator|equipment)?\s*(dealer|rental|sales)$/i.test(line)) continue;
    const name = cleanSeller(line);
    if (name) return name;
  }
  return "";
}

function extractWebsite(given: string, blob: string) {
  if (given.trim()) return given.trim().slice(0, 400);
  const hit = blob.match(/\b(?:https?:\/\/)?(?:www\.)?([a-z][a-z0-9-]*\.[a-z]{2,}(?:\.[a-z]{2,})*)(?:\/[^\s]*)?/i);
  if (!hit) return "";
  const host = String(hit[1] || "").toLowerCase();
  if (/\b(google|gstatic|facebook|instagram|maps\.|youtube|twitter|linkedin|craigslist|apple\.com)\b/.test(host)) return "";
  const raw = hit[0].replace(/[),.;]+$/, "");
  return (raw.startsWith("http") ? raw : `https://${raw}`).slice(0, 400);
}

function extractSellerName(given: string, blob: string) {
  if (given.trim()) return given.trim().slice(0, 80);
  const posted = blob.match(/(?:posted by|listed by|seller(?: name)?|dealer|company|sold by)\s*[:\-]\s*([^\n]{3,70})/i);
  if (posted) {
    const name = cleanSeller(posted[1]);
    if (name) return name;
  }
  const company = blob.match(/\b([A-Z][A-Za-z0-9 .'&-]{1,50}\s(?:LLC|Inc\.?|Ltd|Corp\.?))\b/);
  if (company) return company[1].trim().slice(0, 80);
  const maps = extractMapsBusiness(blob);
  if (maps) return maps;
  const lines = blob.split(/\n+/).map((line) => line.trim().replace(/\s+/g, " ")).filter(Boolean);
  for (const line of lines) {
    if (line.length > 70) continue;
    if (/^(call|phone|email|price|asking|location|dimensions?|weight|shipping)/i.test(line)) continue;
    if (/\b(machinery|equipment|rental|dealership|lift sales)\b/i.test(line) && !/\$/.test(line) && !/\b(forklift|excavator|skid\s*steer|bobcat|dozer)\b/i.test(line)) {
      return line.slice(0, 80);
    }
  }
  return "";
}

function extractDimensions(given: string, blob: string) {
  if (given.trim()) return given.trim();
  const withUnits = blob.match(/\b\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?(?:\s*(?:x|×)\s*\d+(?:\.\d+)?)?\s*(?:in|ft|feet|inches|")\b/i);
  if (withUnits) return withUnits[0];
  const bare = blob.match(/\b\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?(?:\s*(?:x|×)\s*\d+(?:\.\d+)?)\b/i);
  if (!bare) return "";
  const parsed = parseDimensions(bare[0]);
  if (parsed.lengthFt == null || parsed.widthFt == null) return "";
  return bare[0];
}

export function captureFacts(extracted: ExtractedListing) {
  return [
    extracted.sellerName ? { k: "Seller", v: extracted.sellerName } : null,
    extracted.city || extracted.state ? { k: "City", v: [extracted.city, extracted.state].filter(Boolean).join(", ") } : null,
    extracted.phone ? { k: "Phone", v: extracted.phone } : null,
    extracted.website ? { k: "Site", v: extracted.website } : null,
    extracted.email ? { k: "Email", v: extracted.email } : null,
    extracted.dimensions ? { k: "Dims", v: extracted.dimensions } : null,
    extracted.weight ? { k: "Weight", v: extracted.weight } : null,
    extracted.equipmentType ? { k: "Unit", v: extracted.equipmentType } : null,
    extracted.askingPrice != null ? { k: "Their ask", v: `$${Math.round(extracted.askingPrice)}` } : null,
  ].filter(Boolean) as { k: string; v: string }[];
}

export function extractListingData(payload: CapturePayload): ExtractedListing {
  const blob = [payload.title, payload.description, payload.pageText, payload.notes].filter(Boolean).join("\n");
  const firstLine = (payload.title || blob.split("\n").find((line) => line.trim()) || "Untitled listing").trim();
  const named = parsePlace(payload.location || "", payload.city || "", payload.state || "");
  const fromBlob = extractPlaceFromText(blob);
  const place = named.city || named.state ? named : fromBlob;
  const url = (payload.url || "").trim();
  const price = parsePrice(payload.price) ?? parseListingPrice(blob);
  const email = payload.email || (blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || "";
  const dims = extractDimensions(payload.dimensions || "", blob);
  const weight = payload.weight || (blob.match(/\b\d[\d,]*\s*(?:lbs?|pounds|#|tons?|kg)\b/i) || [])[0] || "";
  const qtyRaw = payload.quantity;
  const quantity = typeof qtyRaw === "number" ? qtyRaw : qtyRaw ? Number(qtyRaw) || null : null;
  const equipment = payload.equipmentType || guessEquipment(firstLine + " " + blob);
  return {
    title: firstLine.slice(0, 160),
    description: (payload.description || payload.pageText || "").trim().slice(0, 4000),
    source: payload.source || sourceFromUrl(url),
    sourceUrl: url,
    sellerName: extractSellerName(payload.sellerName || "", blob),
    sellerUrl: (payload.sellerUrl || "").trim(),
    city: place.city,
    state: place.state,
    askingPrice: price,
    category: payload.category || guessCategory(firstLine + " " + blob),
    equipmentType: equipment,
    dimensions: dims,
    weight,
    quantity,
    pickupLocation: payload.pickupLocation || [place.city, place.state].filter(Boolean).join(", "),
    destination: payload.destination || "",
    phone: extractPublishedPhone(payload.phone || "", blob),
    email,
    website: extractWebsite(payload.website || "", blob),
    notes: payload.notes || "",
  };
}

function guessEquipment(text: string) {
  const hit = text.match(HEAVY) || text.match(VEHICLE);
  return hit ? hit[0].replace(/\s+/g, " ") : "";
}

function guessCategory(text: string) {
  if (HEAVY.test(text) && /forklift|bobcat|skid|excavator|loader|crane|lift/i.test(text)) return "Heavy Equipment";
  if (/cnc|lathe|mill|press|laser|plasma/i.test(text)) return "Machinery";
  if (/motorcycle|motorbike/i.test(text)) return "Motorcycles";
  if (VEHICLE.test(text)) return "Vehicles";
  if (COMMERCIAL.test(text)) return "Commercial Equipment";
  if (/trailer/i.test(text)) return "Trailers";
  if (HOUSEHOLD.test(text)) return "Household";
  return "Other";
}

export function classifyFreightType(text: string, weight = "", dimensions = ""): { type: FreightType; certainty: "known" | "estimate" | "unknown" } {
  const blob = `${text} ${weight} ${dimensions}`.toLowerCase();
  if (/oversiz|overweight|crane|excavator|dozer|paver/.test(blob)) return { type: "Specialized / Oversized", certainty: "estimate" };
  if (/motorcycle|car\b|suv|sedan|coupe|vehicle transport/.test(blob)) return { type: "Vehicle Transport", certainty: "estimate" };
  if (/reefer|refrigerat|frozen|produce/.test(blob)) return { type: "Reefer", certainty: "estimate" };
  if (/flatbed|skid steer|bobcat|forklift|tractor|machinery|cnc|generator|trailer/.test(blob)) return { type: "Flatbed", certainty: "estimate" };
  if (/hotshot|pickup\s*truck/.test(blob)) return { type: "Hotshot", certainty: "estimate" };
  if (/pallet|ltl|boxes/.test(blob)) return { type: "LTL", certainty: "estimate" };
  if (/ftl|full\s*truck|dry\s*van/.test(blob)) return { type: "Dry Van", certainty: "estimate" };
  if (HEAVY.test(blob)) return { type: "Flatbed", certainty: "estimate" };
  if (!text.trim()) return { type: "Unknown", certainty: "unknown" };
  return { type: "Unknown", certainty: "unknown" };
}

export function estimateRecurringShipperPotential(input: {
  sellerName?: string;
  description?: string;
  listingCount?: number;
  category?: string;
  source?: string;
}): RecurringPotential {
  const listingCount = input.listingCount || 1;
  const blob = `${input.sellerName} ${input.description} ${input.category}`.toLowerCase();
  if (listingCount >= 8 || DEALER.test(blob) && listingCount >= 3) return "High";
  if (listingCount >= 3 || DEALER.test(blob) || COMMERCIAL.test(blob)) return "Medium";
  return "Low";
}

export function analyzeFreightOpportunity(extracted: ExtractedListing, listingCount = 1): FreightAnalysis {
  const blob = [extracted.title, extracted.description, extracted.category, extracted.equipmentType, extracted.notes].join(" ");
  let score = 22;
  const why: string[] = [];
  const estimates: string[] = [];
  const known: string[] = [];
  const unknown: string[] = [];

  if (extracted.title) known.push("Listing title");
  else unknown.push("Listing title");
  if (extracted.askingPrice != null) known.push(`Asking price $${Math.round(extracted.askingPrice)}`);
  else unknown.push("Asking price");
  if (extracted.city || extracted.state) known.push("Location");
  else unknown.push("Location");
  if (extracted.weight) known.push(`Weight ${extracted.weight}`);
  else unknown.push("Exact weight");
  if (extracted.dimensions) known.push(`Dimensions ${extracted.dimensions}`);
  else unknown.push("Exact dimensions");
  if (extracted.destination) known.push("Destination");
  else unknown.push("Destination");
  if (extracted.phone || extracted.email) known.push("Direct contact");
  else unknown.push("Phone / email");

  const heavy = HEAVY.test(blob);
  const household = HOUSEHOLD.test(blob) && !heavy;
  if (heavy) {
    score += 34;
    why.push("Item looks like heavy equipment or industrial machinery.");
  }
  if (/forklift|bobcat|skid steer|excavator|cnc/i.test(blob)) {
    score += 8;
    why.push("This category commonly needs professional freight, not parcel shipping.");
  }
  if (VEHICLE.test(blob) && !household && !heavy) {
    score += 18;
    why.push("Vehicle or trailer transport is a realistic lane.");
  }
  if (COMMERCIAL.test(blob)) {
    score += 12;
    why.push("Commercial equipment sellers often move inventory repeatedly.");
  }
  if (extracted.askingPrice != null) {
    if (extracted.askingPrice >= 10000) {
      score += 16;
      why.push("Value is high enough that freight cost is usually justified.");
    } else if (extracted.askingPrice >= 2500) {
      score += 10;
      why.push("Price point often supports LTL, hotshot, or flatbed.");
    } else if (extracted.askingPrice < 150) {
      score -= 28;
      why.push("Low value relative to typical freight cost.");
    }
  }
  const lbs = Number((extracted.weight.match(/([\d,]+)/) || [])[1]?.replace(/,/g, "") || 0);
  if (lbs >= 500) {
    score += 12;
    estimates.push(`Weight class around ${lbs} lb`);
  }
  if (SHIPPING.test(blob) || INTERSTATE.test(blob)) {
    score += 12;
    why.push("Listing already mentions shipping, delivery, or out-of-state buyers.");
  }
  if (DEALER.test(extracted.sellerName) || DEALER.test(blob)) {
    score += 10;
    why.push("Seller reads like a business or dealer, not a one-off household sale.");
  }
  const shipperRole = detectShipperRole({
    source: extracted.source,
    sellerName: extracted.sellerName,
    title: extracted.title,
    description: extracted.description,
  });
  if (shipperRole === "Yard") {
    score += 16;
    why.push("Looks like a yard that already ships machines — the relationship, not a one-load bid.");
  } else if (shipperRole === "Auction") {
    score += 10;
    why.push("Auction clock: someone has a removal deadline after the hammer.");
  } else if (shipperRole === "Private") {
    score -= 4;
    why.push("Private listing — often a one-shot unless they have a business name.");
  }
  if (listingCount >= 5) {
    score += 14;
    why.push(`Seller has ${listingCount} listings in the workspace — recurring shipper signal.`);
  }
  if (HOUSEHOLD.test(blob) && !heavy) {
    score -= 36;
    why.push("Looks like a household or parcel-sized consumer item.");
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const freight = classifyFreightType(blob, extracted.weight, extracted.dimensions);
  if (freight.type !== "Unknown") estimates.push(`Likely equipment: ${freight.type}`);
  const recurring = estimateRecurringShipperPotential({
    sellerName: extracted.sellerName,
    description: blob,
    listingCount,
    category: extracted.category,
    source: extracted.source,
  });

  let confidence: ScoreConfidence = "MEDIUM";
  if ((known.length >= 3 && heavy) || (known.length >= 4 && score >= 70)) confidence = "HIGH";
  if (known.length <= 2 || score < 25) confidence = "LOW";

  if (!why.length) why.push("Limited listing detail — score is a rough screen, not a freight quote.");

  const fit = recommendEquipment({
    text: blob,
    dimensions: extracted.dimensions,
    weight: extracted.weight,
  });
  if (fit.trailer !== "UNKNOWN") estimates.push(`Trailer guess: ${fit.trailerName} · ${fit.loadClass}`);

  const item = (extracted.equipmentType || extracted.title.split(/[|,–-]/)[0] || "item").trim().toLowerCase();
  const openers = openingLines(item, shipperRole);
  const analysis: FreightAnalysis = {
    leadId: "",
    score,
    confidence,
    why: why.slice(0, 3).join(" "),
    freightType: freight.type,
    recurringPotential: recurring,
    known,
    estimates,
    unknown,
    openerCasual: openers.Casual[0],
    openerDirect: openers.Direct[0],
    openerBusiness: openers.Business[0],
    openerShort: openers.Short[0],
    openerFollowUp: openers.FollowUp[0],
    analyzedAt: nowIso(),
    shipperRole,
    trailerHint: `${fit.trailerName} · ${fit.loadClass}`,
    loadClass: fit.loadClass,
  };
  return analysis;
}

export function openingLines(item: string, role: ShipperRole = "Unknown") {
  const unit = item || "unit";
  if (role === "Yard") {
    return {
      Casual: [
        `Hey — not looking to replace your guy. When a ${unit} sells and your usual transporter is booked, I can cover it. Who books outbound freight at the yard?`,
        `Quick one on the ${unit}: do you already have someone on the routing guide for sold machines, or is it still ad hoc?`,
        `If this ${unit} has to leave the lot this week, I haul equipment. Backup only — who should I talk to about outbound?`,
      ],
      Direct: [
        `I move equipment. If this ${unit} is going to a buyer out of state, I can quote it. Who handles dispatch on your sold units?`,
        `Need a backup truck when your regular carrier can’t cover a sold ${unit}? I can send a rate. Who books it?`,
        `Do you arrange freight on sold ${unit} inventory, or does the buyer? I can be the backup either way.`,
      ],
      Business: [
        `When this ${unit} sells, do you typically arrange freight from the yard? Happy to be a backup carrier on the routing guide.`,
        `I work dealers who already ship. If your usual guy can’t cover this ${unit}, I can quote. Who should get that?`,
        `Looking to be backup freight for sold ${unit} inventory — not exclusive. Who books outbound at your location?`,
      ],
      Short: [
        `Does the ${unit} need shipping from the yard, or is it pickup only?`,
        `Who books outbound freight when this ${unit} sells?`,
        `Backup truck for the ${unit} if your guy is booked — interested?`,
      ],
      FollowUp: [
        `Circling back on the ${unit} — still worth being backup if a buyer is out of town?`,
        `Any movement on transport for the ${unit}, or still handled in-house?`,
        `Bumping this once. If the ${unit} needs a truck, I can quote. No spam after this unless you want it.`,
      ],
    };
  }
  return {
    Casual: [
      `Hey, random question about the ${unit}. If somebody bought it from another state, do you already have someone you normally use to transport it?`,
      `If this ${unit} sells to someone who can’t pick it up, do you already have a transporter, or should I send a number?`,
      `Quick one — does the ${unit} need shipping, or is it local pickup only?`,
    ],
    Direct: [
      `If this ${unit} needs to move out of state, I can quote it. Do you already have a transporter lined up?`,
      `I haul equipment. Need a rate to move the ${unit}, or is pickup only?`,
      `Buyer paying shipping on the ${unit}? I can quote if you don’t already have a guy.`,
    ],
    Business: [
      `When this ${unit} sells, do you typically arrange freight or should I send a rate?`,
      `I can quote transport on the ${unit} if the buyer isn’t local. Do you handle that or do they?`,
      `If freight is on you for the ${unit}, I can send a number. Pickup only is fine too — just say.`,
    ],
    Short: [
      `Does the ${unit} need shipping, or is it pickup only?`,
      `Need a truck for the ${unit}?`,
      `Shipping on the ${unit}, or local pickup?`,
    ],
    FollowUp: [
      `Circling back on the ${unit} — any movement on transport yet?`,
      `Just bumping this in case it got buried. If the ${unit} sells out of town, do you already have transport covered?`,
      `Last ping on the ${unit}. If you want a transport option I’ll send it; otherwise I’ll leave you alone.`,
    ],
  };
}

export function generateOpeningMessage(analysis: FreightAnalysis, style: MessageStyle = "Casual", seed = "", sentToday = 0) {
  const role = analysis.shipperRole || "Unknown";
  const lines = openingLines(guessItemFromOpeners(analysis), role);
  const pack =
    style === "Direct"
      ? lines.Direct
      : style === "Business"
        ? lines.Business
        : style === "Very Short"
          ? lines.Short
          : style === "Follow-Up"
            ? lines.FollowUp
            : lines.Casual;
  const stored =
    style === "Direct"
      ? analysis.openerDirect
      : style === "Business"
        ? analysis.openerBusiness
        : style === "Very Short"
          ? analysis.openerShort
          : style === "Follow-Up"
            ? analysis.openerFollowUp
            : analysis.openerCasual;
  const mixed = [stored, ...pack.filter((line) => line !== stored)];
  return mixed[variantIndex(seed || analysis.leadId || "x", sentToday, mixed.length)] || stored;
}

function guessItemFromOpeners(analysis: FreightAnalysis) {
  const text = analysis.openerCasual || analysis.why || "item";
  const hit = text.match(/(?:the|a|this)\s+([a-z0-9][a-z0-9\s-]{2,40}?)(?:\.|,|:| if| sells| need| has)/i);
  return (hit?.[1] || "item").trim();
}

export function generateFollowUp(lead: Lead, reason = "") {
  const item = (lead.equipmentType || lead.listingTitle || "listing").toLowerCase();
  if (reason.toLowerCase().includes("voicemail") || reason.toLowerCase().includes("no pickup")) {
    return `Left a note yesterday on the ${item}. Who books outbound if it sells out of town?`;
  }
  if (reason.toLowerCase().includes("quote")) return `Wanted to check back — still need a number to move the ${item}?`;
  if (reason.toLowerCase().includes("no reply") || reason.toLowerCase().includes("reply")) {
    return `Just bumping this in case it got buried. If the ${item} sells out of town, do you already have transport covered?`;
  }
  return `Checking back on the ${item}. Still worth sending a transport option?`;
}

function normName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(llc|inc|co|the)\b/g, "").trim();
}

function similarTitle(a: string, b: string) {
  const left = normName(a);
  const right = normName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function samePhone(a: string, b: string) {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return left.length >= 10 && left === right;
}

function sameEmail(a: string, b: string) {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  return Boolean(left) && left === right;
}

export function detectPossibleDuplicate(workspace: Workspace, extracted: ExtractedListing, ignoreLeadId = "") {
  const url = extracted.sourceUrl.trim().toLowerCase();
  const phone = extracted.phone;
  const email = extracted.email;

  const listingHit = (workspace.listings || []).find((item) => {
    if (!url || item.sourceUrl.trim().toLowerCase() !== url) return false;
    if (extracted.phone && item.phone && !samePhone(item.phone, phone)) return false;
    return similarTitle(item.title, extracted.title) || samePhone(item.phone, phone);
  });
  if (listingHit) {
    const lead = workspace.leads.find((item) => item.id === listingHit.leadId);
    if (lead && lead.id !== ignoreLeadId && !(extracted.phone && lead.phone && !samePhone(lead.phone, extracted.phone))) {
      return { kind: "listing" as const, lead, listing: listingHit };
    }
  }

  const leadHit = workspace.leads.find((item) => {
    if (item.id === ignoreLeadId || item.archivedAt) return false;
    if (samePhone(item.phone, phone)) return true;
    if (sameEmail(item.email, email)) return true;
    return false;
  });
  if (leadHit) return { kind: "seller" as const, lead: leadHit, listing: (workspace.listings || []).find((item) => item.leadId === leadHit.id) };
  return null;
}

export function upsertCompany(workspace: Workspace, extracted: ExtractedListing, lead: Lead): { companies: Company[]; company: Company } {
  const companies = [...(workspace.companies || [])];
  const keyUrl = extracted.sellerUrl.trim().toLowerCase();
  const keyName = normName(extracted.sellerName || companyName(lead));
  const existing = companies.find((item) => {
    if (lead.companyId && item.id === lead.companyId) return true;
    if (keyUrl && item.sellerUrl.trim().toLowerCase() === keyUrl) return true;
    if (keyName && normName(item.name) === keyName) return true;
    if (extracted.phone && normalizePhone(item.phone) === normalizePhone(extracted.phone)) return true;
    return false;
  });
  const listings = (workspace.listings || []).filter((item) => item.leadId === lead.id || (existing && item.companyId === existing.id));
  const prices = listings.map((item) => item.askingPrice).filter((n): n is number => n != null);
  const avg = prices.length ? Math.round(prices.reduce((sum, n) => sum + n, 0) / prices.length) : extracted.askingPrice || 0;
  const categories = Array.from(new Set(listings.map((item) => item.category).filter(Boolean).concat(extracted.category ? [extracted.category] : [])));
  const listingCount = Math.max(listings.length, existing?.listingCount || 0, 1);
  const recurringCandidate = estimateRecurringShipperPotential({
    sellerName: extracted.sellerName || existing?.name,
    listingCount,
    category: categories.join(" "),
    description: extracted.description,
  }) !== "Low";

  if (existing) {
    const company: Company = {
      ...existing,
      name: extracted.sellerName || existing.name,
      website: extracted.website || existing.website,
      phone: extracted.phone || existing.phone,
      email: extracted.email || existing.email,
      city: extracted.city || existing.city,
      state: extracted.state || existing.state,
      sellerUrl: extracted.sellerUrl || existing.sellerUrl,
      listingCount,
      categories,
      avgItemValue: avg,
      recurringCandidate,
    };
    return { companies: companies.map((item) => (item.id === company.id ? company : item)), company };
  }

  const company: Company = {
    id: uid("co"),
    name: extracted.sellerName || companyName(lead) || extracted.title,
    website: extracted.website,
    phone: extracted.phone,
    email: extracted.email,
    city: extracted.city,
    state: extracted.state,
    sellerUrl: extracted.sellerUrl,
    listingCount: 1,
    categories,
    avgItemValue: avg,
    recurringCandidate,
    notes: recurringCandidate
      ? "Commercial listing pattern — treat as a recurring shipper candidate, not a one-off."
      : "",
    createdAt: nowIso(),
  };
  return { companies: [company, ...companies], company };
}

export function blankProspect(owner: string, overlay: Partial<Lead> = {}): Lead {
  const stamp = nowIso();
  return {
    id: overlay.id || uid("lead"),
    name: overlay.name || "New client",
    property: overlay.property || overlay.company || "",
    phone: overlay.phone || "",
    email: overlay.email || "",
    city: overlay.city || "",
    state: overlay.state || "",
    utility: overlay.utility || "",
    monthlyBill: overlay.monthlyBill ?? null,
    status: overlay.status || "Discovered",
    priority: overlay.priority || "Medium",
    owner: overlay.owner || owner,
    source: overlay.source || "Manual",
    consent: overlay.consent || "unknown",
    dnc: overlay.dnc || false,
    attempts: overlay.attempts || 0,
    nextAction: overlay.nextAction || "Label this client, then send the opener",
    nextFollowUp: overlay.nextFollowUp || "",
    estimatedValue: overlay.estimatedValue || 0,
    notes: overlay.notes || "",
    homeowner: overlay.homeowner || "",
    createdAt: overlay.createdAt || stamp,
    updatedAt: overlay.updatedAt || stamp,
    company: overlay.company || overlay.property || "",
    website: overlay.website || "",
    listingUrl: overlay.listingUrl || "",
    sellerUrl: overlay.sellerUrl || "",
    category: overlay.category || "",
    equipmentType: overlay.equipmentType || "",
    freightScore: overlay.freightScore ?? 0,
    scoreConfidence: overlay.scoreConfidence || "LOW",
    scoreWhy: overlay.scoreWhy || "",
    freightType: overlay.freightType || "Unknown",
    recurringPotential: overlay.recurringPotential || "Low",
    lastContactAt: overlay.lastContactAt,
    tags: overlay.tags || [],
    askingPrice: overlay.askingPrice ?? null,
    origin: overlay.origin || "",
    destination: overlay.destination || "",
    listingTitle: overlay.listingTitle || "",
    listingDescription: overlay.listingDescription || "",
    companyId: overlay.companyId,
    dimensions: overlay.dimensions || "",
    weight: overlay.weight || "",
    quantity: overlay.quantity ?? null,
    archivedAt: overlay.archivedAt,
    label: overlay.label || "",
    shipperRole: overlay.shipperRole,
    trailerHint: overlay.trailerHint,
    loadClass: overlay.loadClass,
    booker: overlay.booker || "",
    bookerPhone: overlay.bookerPhone || "",
  };
}

export function applyAnalysisToLead(lead: Lead, analysis: FreightAnalysis, extracted: ExtractedListing): Lead {
  return {
    ...lead,
    name: extracted.sellerName || lead.name,
    property: extracted.sellerName || lead.property,
    company: extracted.sellerName || lead.company,
    phone: extracted.phone || lead.phone,
    email: extracted.email || lead.email,
    city: extracted.city || lead.city,
    state: extracted.state || lead.state,
    website: extracted.website || lead.website,
    listingUrl: extracted.sourceUrl || lead.listingUrl,
    sellerUrl: extracted.sellerUrl || lead.sellerUrl,
    source: extracted.source || lead.source,
    category: extracted.category || lead.category,
    equipmentType: extracted.equipmentType || lead.equipmentType,
    listingTitle: extracted.title || lead.listingTitle,
    listingDescription: extracted.description || lead.listingDescription,
    askingPrice: extracted.askingPrice ?? lead.askingPrice,
    origin: extracted.pickupLocation || lead.origin,
    destination: extracted.destination || lead.destination,
    dimensions: extracted.dimensions || lead.dimensions,
    weight: extracted.weight || lead.weight,
    quantity: extracted.quantity ?? lead.quantity,
    notes: extracted.notes || lead.notes,
    freightScore: analysis.score,
    scoreConfidence: analysis.confidence,
    scoreWhy: analysis.why,
    freightType: analysis.freightType,
    recurringPotential: analysis.recurringPotential,
    shipperRole: analysis.shipperRole || lead.shipperRole,
    trailerHint: analysis.trailerHint || lead.trailerHint,
    loadClass: analysis.loadClass || lead.loadClass,
    estimatedValue: lead.estimatedValue || 0,
    priority: analysis.score >= 80 ? "High" : analysis.score >= 55 ? "Medium" : "Low",
    updatedAt: nowIso(),
  };
}

export function ingestCapture(workspace: Workspace, payload: CapturePayload, overlay?: { extracted?: ExtractedListing; analysis?: FreightAnalysis }) {
  const extracted = overlay?.extracted || extractListingData(payload);
  const dup = detectPossibleDuplicate(workspace, extracted);
  const stamp = nowIso();
  const owner = payload.owner || workspace.settings.defaultOwner || workspace.settings.operator;
  const existingListings = workspace.listings || [];

  if (dup?.kind === "listing" && dup.listing) {
    const listingCount = existingListings.filter((item) => item.leadId === dup.lead.id).length;
    const analysis = {
      ...(overlay?.analysis || analyzeFreightOpportunity(extracted, listingCount)),
      leadId: dup.lead.id,
      listingId: dup.listing.id,
    };
    const listing: Listing = {
      ...dup.listing,
      title: extracted.title || dup.listing.title,
      description: extracted.description || dup.listing.description,
      askingPrice: extracted.askingPrice ?? dup.listing.askingPrice,
      city: extracted.city || dup.listing.city,
      state: extracted.state || dup.listing.state,
      phone: extracted.phone || dup.listing.phone,
      email: extracted.email || dup.listing.email,
      notes: extracted.notes || dup.listing.notes,
      priceHistory:
        extracted.askingPrice != null && extracted.askingPrice !== dup.listing.askingPrice
          ? [{ price: extracted.askingPrice, at: stamp }, ...dup.listing.priceHistory]
          : dup.listing.priceHistory,
    };
    const lead = applyAnalysisToLead(dup.lead, analysis, extracted);
    const { companies, company } = upsertCompany({ ...workspace, listings: existingListings.map((item) => (item.id === listing.id ? listing : item)) }, extracted, { ...lead, companyId: lead.companyId });
    return {
      workspace: {
        ...workspace,
        leads: workspace.leads.map((item) => (item.id === lead.id ? { ...lead, companyId: company.id } : item)),
        listings: existingListings.map((item) => (item.id === listing.id ? { ...listing, companyId: company.id } : item)),
        companies,
        analyses: [{ ...analysis, leadId: lead.id }, ...(workspace.analyses || []).filter((item) => item.leadId !== lead.id || item.listingId !== listing.id)],
        updatedAt: stamp,
      },
      lead: { ...lead, companyId: company.id },
      listing,
      analysis,
      duplicate: true,
      updated: true,
    };
  }

  const lead = dup?.lead || blankProspect(owner, {
    name: extracted.sellerName || extracted.title,
    property: extracted.sellerName || extracted.title,
    source: extracted.source,
    status: "Discovered",
    nextAction: "Label this client, then send the opener",
  });
  const isNewLead = !dup?.lead;
  const listing: Listing = {
    id: uid("lst"),
    leadId: lead.id,
    source: extracted.source,
    sourceUrl: extracted.sourceUrl,
    title: extracted.title,
    description: extracted.description,
    sellerName: extracted.sellerName || lead.name,
    sellerUrl: extracted.sellerUrl,
    city: extracted.city,
    state: extracted.state,
    askingPrice: extracted.askingPrice,
    category: extracted.category,
    equipmentType: extracted.equipmentType,
    dimensions: extracted.dimensions,
    weight: extracted.weight,
    quantity: extracted.quantity,
    pickupLocation: extracted.pickupLocation,
    destination: extracted.destination,
    phone: extracted.phone,
    email: extracted.email,
    website: extracted.website,
    notes: extracted.notes,
    imageUrls: [],
    discoveredAt: stamp,
    priceHistory: extracted.askingPrice != null ? [{ price: extracted.askingPrice, at: stamp }] : [],
  };
  const listings = [listing, ...existingListings];
  const listingCount = listings.filter((item) => item.leadId === lead.id).length;
  const analysis = {
    ...(overlay?.analysis || analyzeFreightOpportunity(extracted, listingCount)),
    leadId: lead.id,
    listingId: listing.id,
  };
  const scored = applyAnalysisToLead(lead, analysis, extracted);
  const kind = suggestClientKind({
    source: extracted.source,
    sellerName: extracted.sellerName,
    title: extracted.title,
    description: extracted.description,
    website: extracted.website,
  });
  const { companies, company } = upsertCompany({ ...workspace, listings }, extracted, scored);
  const tagged = {
    ...scored,
    companyId: company.id,
    label: scored.label || kind || scored.label,
    tags: company.recurringCandidate ? ["recurring-candidate"] : scored.tags || [],
  };
  listing.companyId = company.id;

  const opportunities = isNewLead
    ? [
        {
          id: uid("opp"),
          leadId: tagged.id,
          name: tagged.name,
          property: companyName(tagged),
          stage: "Discovered",
          value: 0,
          probability: 10,
          owner,
          source: tagged.source,
          nextAction: tagged.nextAction,
          expectedClose: "",
          notes: analysis.why,
          createdAt: stamp,
          updatedAt: stamp,
          stageEnteredAt: stamp,
          history: [],
          origin: tagged.origin,
          destination: tagged.destination,
          freightType: tagged.freightType,
          commodity: tagged.listingTitle,
        },
        ...workspace.opportunities,
      ]
    : workspace.opportunities;

  return {
    workspace: {
      ...workspace,
      leads: isNewLead ? [tagged, ...workspace.leads] : workspace.leads.map((item) => (item.id === tagged.id ? tagged : item)),
      listings,
      companies,
      analyses: [analysis, ...(workspace.analyses || []).filter((item) => !(item.leadId === tagged.id && item.listingId === listing.id))],
      opportunities,
      activities: [
        {
          id: uid("act"),
          entityType: "lead",
          entityId: tagged.id,
          type: isNewLead ? "captured" : "listing_added",
          detail: isNewLead ? `Captured ${extracted.title}` : `Added listing ${extracted.title}`,
          at: stamp,
        },
        ...workspace.activities,
      ].slice(0, 400),
      updatedAt: stamp,
    },
    lead: tagged,
    listing,
    analysis,
    duplicate: Boolean(dup),
    updated: Boolean(dup),
  };
}

export type ProspectFilter =
  | "all"
  | "unlabeled"
  | "uncontacted"
  | "talking"
  | "contacted"
  | "replied"
  | "interested"
  | "high"
  | "phone"
  | "quote"
  | "recurring"
  | "not_interested"
  | "followup";

export function matchesProspectFilter(lead: Lead, filter: ProspectFilter, now = Date.now()) {
  if (filter === "all") return true;
  if (filter === "unlabeled") return !lead.label;
  if (filter === "high") return (lead.freightScore || 0) >= 80 || lead.priority === "High" || lead.priority === "Critical";
  if (filter === "uncontacted") return UNCONTACTED_STAGES.has(lead.status);
  if (filter === "talking") return ["Contacted", "Replied", "Qualified", "Contact Info Obtained"].includes(lead.status);
  if (filter === "contacted") return lead.status === "Contacted";
  if (filter === "replied") return lead.status === "Replied";
  if (filter === "interested") return REPLIED_STAGES.has(lead.status) && !WON_STAGES.has(lead.status);
  if (filter === "phone") return Boolean(lead.phone) || PHONE_STAGES.has(lead.status);
  if (filter === "quote") return QUOTE_STAGES.has(lead.status);
  if (filter === "recurring") return lead.status === "Recurring Account" || lead.recurringPotential === "High" || (lead.tags || []).includes("recurring-candidate");
  if (filter === "not_interested") return lead.status === "Load Lost" || (lead.tags || []).includes("not-interested");
  if (filter === "followup") return Boolean(lead.nextFollowUp) && Date.parse(lead.nextFollowUp) <= now + 86400000;
  return true;
}

export function outreachQueue(leads: Lead[]) {
  return workQueue(leads);
}

export function isAccountLead(lead: Lead, workspace: Workspace) {
  if (lead.archivedAt) return false;
  if (lead.status === "Recurring Account" || WON_STAGES.has(lead.status)) return true;
  return (workspace.shipments || []).some((item) => item.leadId === lead.id && ["Delivered", "Paid", "Booked", "In Transit"].includes(item.status));
}

export function summarizeProspect(workspace: Workspace, lead: Lead) {
  const listings = (workspace.listings || []).filter((item) => item.leadId === lead.id);
  const calls = (workspace.callLogs || []).filter((item) => item.leadId === lead.id);
  const follow = (workspace.callbacks || []).filter((item) => item.leadId === lead.id);
  const quotes = (workspace.quotes || []).filter((item) => item.leadId === lead.id);
  const shipments = (workspace.shipments || []).filter((item) => item.leadId === lead.id);
  const acts = (workspace.activities || []).filter((item) => item.entityId === lead.id);
  const first = [...acts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  const company = (workspace.companies || []).find((item) => item.id === lead.companyId);
  const firstDate = new Date(first?.at || lead.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const topic = lead.listingTitle || listings[0]?.title || "a listing";
  const listingCount = listings.length || company?.listingCount || 1;
  const listingWord = listingCount === 1 ? "listing" : "listings";
  const openFollow = follow.find((item) => item.status === "open");
  const parts = [
    "You first captured " + lead.name + " on " + firstDate + " regarding " + topic + ".",
    lead.scoreWhy || "",
    listings.length > 1 || company?.recurringCandidate
      ? (company?.name || lead.name) + " has " + listingCount + " " + listingWord + " on file" + (company?.recurringCandidate ? " and looks like a recurring shipper candidate" : "") + "."
      : "",
    openFollow ? "Open follow-up: " + (openFollow.reason || "") + "." : "",
    quotes[0] ? "Latest quote " + quotes[0].origin + " to " + quotes[0].destination + "." : "",
    shipments[0] ? "Latest shipment " + shipments[0].status + " " + shipments[0].origin + " to " + shipments[0].destination + "." : "No shipment booked yet.",
    calls[0] ? "Last logged call: " + calls[0].outcome.replaceAll("_", " ") + "." : "",
  ];
  return parts.filter(Boolean).join(" ");
}

export function funnelCounts(workspace: Workspace) {
  const live = workspace.leads.filter((lead) => !lead.archivedAt);
  const contacted = live.filter((lead) => CONTACTED_STAGES.has(lead.status) || (lead.attempts || 0) > 0 || Boolean(lead.lastContactAt));
  const replied = live.filter((lead) => REPLIED_STAGES.has(lead.status));
  const qualified = live.filter((lead) => QUALIFIED_STAGES.has(lead.status));
  const phone = live.filter((lead) => Boolean(lead.phone) || PHONE_STAGES.has(lead.status));
  const quotes = live.filter((lead) => QUOTE_STAGES.has(lead.status) || (workspace.quotes || []).some((item) => item.leadId === lead.id));
  const won = live.filter((lead) => WON_STAGES.has(lead.status));
  return {
    discovered: live.length,
    contacted: contacted.length,
    replied: replied.length,
    qualified: qualified.length,
    phone: phone.length,
    quotes: quotes.length,
    won: won.length,
  };
}

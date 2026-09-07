import type {
  Company,
  FreightAnalysis,
  FreightType,
  Lead,
  Listing,
  RecurringPotential,
  ScoreConfidence,
  Workspace,
} from "./types";
import { CONTACTED_STAGES, PHONE_STAGES, QUALIFIED_STAGES, QUOTE_STAGES, REPLIED_STAGES, UNCONTACTED_STAGES, WON_STAGES } from "./stages";
import { normalizePhone, nowIso, uid } from "./format";

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
  if (/\b(dealer|dealership)\b/.test(hay) || /\b(llc|inc|ltd|corp)\b/.test(seller)) return "Dealer";
  if (/\b(facebook marketplace|craigslist)\b/.test(source) && !/\b(llc|inc|dealer)\b/.test(seller)) return "Private seller";
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
const DEALER = /\b(dealer|dealership|llc|inc\.?|equipment\s*co|machinery|rental|auction)\b/i;
const INTERSTATE = /\b(out\s*of\s*state|nationwide|will\s*ship|can\s*ship|buyer\s*pays\s*shipping)\b/i;

export function companyName(lead: Lead) {
  return (lead.company || lead.property || "").trim();
}

export function leadLocation(lead: Lead) {
  return [lead.city, lead.state].filter(Boolean).join(", ");
}

export function shipmentMargin(customerRate: number, carrierRate: number) {
  return (Number(customerRate) || 0) - (Number(carrierRate) || 0);
}

export function sourceFromUrl(url: string) {
  const host = url.toLowerCase();
  if (host.includes("facebook") || host.includes("fb.com") || host.includes("marketplace")) return "Facebook Marketplace";
  if (host.includes("craigslist")) return "Craigslist";
  if (host.includes("machinerytrader")) return "Machinery Trader";
  if (host.includes("equipmenttrader")) return "Equipment Trader";
  if (host.includes("tractorhouse")) return "TractorHouse";
  if (host.includes("rbauction") || host.includes("ritchiebros") || host.includes("ironplanet") || host.includes("auction") || host.includes("govdeals")) return "Auction";
  if (url.trim()) return "Google";
  return "Manual";
}

function parsePrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "");
  const match = text.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function parsePlace(location: string, city = "", state = "") {
  const text = location.trim();
  const match = text.match(/^([^,]+),\s*([A-Z]{2})\b/i);
  if (match) return { city: city || match[1].trim(), state: (state || match[2]).toUpperCase() };
  const st = text.match(/\b([A-Z]{2})\b/);
  return { city: city || text.replace(/\b[A-Z]{2}\b/, "").replace(/,/g, "").trim(), state: state || (st ? st[1].toUpperCase() : "") };
}

export function extractListingData(payload: CapturePayload): ExtractedListing {
  const blob = [payload.title, payload.description, payload.pageText, payload.notes].filter(Boolean).join("\n");
  const firstLine = (payload.title || blob.split("\n").find((line) => line.trim()) || "Untitled listing").trim();
  const place = parsePlace(payload.location || "", payload.city || "", payload.state || "");
  const url = (payload.url || "").trim();
  const price = parsePrice(payload.price) ?? parsePrice(blob);
  const email = payload.email || (blob.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || "";
  const phoneMatch = blob.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  const dims = payload.dimensions || (blob.match(/\b\d+(?:\.\d+)?\s*(?:x|×)\s*\d+(?:\.\d+)?(?:\s*(?:x|×)\s*\d+(?:\.\d+)?)?\s*(?:in|ft|")\b/i) || [])[0] || "";
  const weight = payload.weight || (blob.match(/\b\d[\d,]*\s*(?:lbs?|pounds|tons?|kg)\b/i) || [])[0] || "";
  const qtyRaw = payload.quantity;
  const quantity = typeof qtyRaw === "number" ? qtyRaw : qtyRaw ? Number(qtyRaw) || null : null;
  const equipment = payload.equipmentType || guessEquipment(firstLine + " " + blob);
  return {
    title: firstLine.slice(0, 160),
    description: (payload.description || payload.pageText || "").trim().slice(0, 4000),
    source: payload.source || sourceFromUrl(url),
    sourceUrl: url,
    sellerName: (payload.sellerName || "").trim(),
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
    phone: payload.phone || (phoneMatch ? phoneMatch[0] : ""),
    email,
    website: payload.website || "",
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

  const item = (extracted.equipmentType || extracted.title.split(/[|,–-]/)[0] || "item").trim().toLowerCase();
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
    openerCasual: `Hey, random question about the ${item}. If somebody bought it from another state, do you already have someone you normally use to transport it?`,
    openerDirect: `If this ${item} needs to move out of state, I can quote it. Do you already have a transporter lined up?`,
    openerBusiness: `When this ${item} sells, do you typically arrange freight or should I send a rate?`,
    openerShort: `Does the ${item} need shipping, or is it pickup only?`,
    openerFollowUp: `Circling back on the ${item} — any movement on transport yet?`,
    analyzedAt: nowIso(),
  };
  return analysis;
}

export function generateOpeningMessage(analysis: FreightAnalysis, style: MessageStyle = "Casual") {
  if (style === "Direct") return analysis.openerDirect;
  if (style === "Business") return analysis.openerBusiness;
  if (style === "Very Short") return analysis.openerShort;
  if (style === "Follow-Up") return analysis.openerFollowUp;
  return analysis.openerCasual;
}

export function generateFollowUp(lead: Lead, reason = "") {
  const item = (lead.equipmentType || lead.listingTitle || "listing").toLowerCase();
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

export function detectPossibleDuplicate(workspace: Workspace, extracted: ExtractedListing, ignoreLeadId = "") {
  const url = extracted.sourceUrl.trim().toLowerCase();
  const seller = extracted.sellerUrl.trim().toLowerCase();
  const phone = normalizePhone(extracted.phone);
  const email = extracted.email.trim().toLowerCase();
  const site = extracted.website.trim().toLowerCase();
  const company = normName(extracted.sellerName);

  const listingHit = (workspace.listings || []).find((item) => {
    if (url && item.sourceUrl.trim().toLowerCase() === url) return true;
    if (seller && item.sellerUrl.trim().toLowerCase() === seller && similarTitle(item.title, extracted.title)) return true;
    return false;
  });
  if (listingHit) {
    const lead = workspace.leads.find((item) => item.id === listingHit.leadId);
    if (lead && lead.id !== ignoreLeadId) return { kind: "listing" as const, lead, listing: listingHit };
  }

  const leadHit = workspace.leads.find((item) => {
    if (item.id === ignoreLeadId || item.archivedAt) return false;
    if (url && (item.listingUrl || "").trim().toLowerCase() === url) return true;
    if (seller && (item.sellerUrl || "").trim().toLowerCase() === seller) return true;
    if (phone.length >= 10 && normalizePhone(item.phone) === phone) return true;
    if (email && item.email.trim().toLowerCase() === email) return true;
    if (site && (item.website || "").trim().toLowerCase() === site) return true;
    if (company && normName(companyName(item)) === company) return true;
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
  const { companies, company } = upsertCompany({ ...workspace, listings }, extracted, scored);
  const tagged = { ...scored, companyId: company.id, tags: company.recurringCandidate ? ["recurring-candidate"] : scored.tags || [] };
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
  return leads
    .filter((lead) => !lead.archivedAt && (UNCONTACTED_STAGES.has(lead.status) || lead.status === "Contacted"))
    .sort((a, b) => (b.freightScore || 0) - (a.freightScore || 0));
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

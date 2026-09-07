import type { CapturePayload, ExtractedListing } from "./freight";
import { analyzeFreightOpportunity, extractListingData, generateOpeningMessage } from "./freight";
import { llmJson, llmText, type LlmProvider } from "./llm";
import type { FreightAnalysis, FreightType, RecurringPotential, ScoreConfidence } from "./types";
import { capText } from "./validate";
import { normalizePhone } from "./format";

const FREIGHT_TYPES: FreightType[] = ["LTL", "FTL", "Flatbed", "Hotshot", "Dry Van", "Reefer", "Vehicle Transport", "Specialized / Oversized", "Unknown"];
const RECURRING: RecurringPotential[] = ["High", "Medium", "Low"];

function blobOf(payload: CapturePayload) {
  return [payload.title, payload.description, payload.pageText, payload.notes, payload.url, payload.sellerName, payload.phone, payload.email, payload.website, payload.location].filter(Boolean).join("\n");
}

function inSource(value: string, source: string) {
  const needle = value.trim().toLowerCase();
  if (!needle) return false;
  return source.toLowerCase().includes(needle);
}

function groundedPhone(value: string, source: string) {
  const digits = normalizePhone(value).replace(/\D/g, "");
  if (digits.length < 10) return "";
  const last10 = digits.slice(-10);
  const hay = source.replace(/\D/g, "");
  return hay.includes(last10) ? value.trim() : "";
}

function groundedEmail(value: string, source: string) {
  const email = value.trim().toLowerCase();
  if (!email.includes("@")) return "";
  return source.toLowerCase().includes(email) ? email : "";
}

function pickText(preferred: string, fallback: string, source: string, requireGrounding = false) {
  const value = capText(preferred || fallback, 400);
  if (!value) return fallback;
  if (!requireGrounding) return value;
  return inSource(value, source) ? value : fallback;
}

export function mergeExtracted(payload: CapturePayload, llm?: Record<string, unknown>): ExtractedListing {
  const rules = extractListingData(payload);
  const source = blobOf(payload);
  if (!llm) return rules;
  const llmSeller = String(llm.sellerName || "").trim();
  const sellerName = llmSeller && (inSource(llmSeller, source) || inSource(llmSeller, rules.title)) ? llmSeller : rules.sellerName;
  const city = pickText(String(llm.city || ""), rules.city, source, true) || rules.city;
  const state = capText(llm.state || rules.state, 8).toUpperCase() || rules.state;
  const asking = typeof llm.askingPrice === "number" && Number.isFinite(llm.askingPrice) ? llm.askingPrice : rules.askingPrice;
  return {
    ...rules,
    title: pickText(String(llm.title || ""), rules.title, source) || rules.title,
    description: rules.description,
    sellerName: sellerName || rules.sellerName,
    city: city || rules.city,
    state: /^[A-Z]{2}$/.test(state) ? state : rules.state,
    askingPrice: asking != null && asking >= 0 && asking <= 1_000_000 ? asking : rules.askingPrice,
    phone: groundedPhone(String(llm.phone || ""), source) || rules.phone,
    email: groundedEmail(String(llm.email || ""), source) || rules.email,
    website: pickText(String(llm.website || ""), rules.website, source, true) || rules.website,
    category: capText(llm.category || rules.category, 80) || rules.category,
    equipmentType: capText(llm.equipmentType || rules.equipmentType, 80) || rules.equipmentType,
    dimensions: pickText(String(llm.dimensions || ""), rules.dimensions, source, true) || rules.dimensions,
    weight: pickText(String(llm.weight || ""), rules.weight, source, true) || rules.weight,
    pickupLocation: pickText(String(llm.pickupLocation || ""), rules.pickupLocation, source) || rules.pickupLocation,
    destination: pickText(String(llm.destination || ""), rules.destination, source, true) || rules.destination,
    notes: rules.notes,
  };
}

function asFreightType(value: unknown): FreightType {
  return FREIGHT_TYPES.includes(value as FreightType) ? (value as FreightType) : "Unknown";
}

function asRecurring(value: unknown): RecurringPotential {
  return RECURRING.includes(value as RecurringPotential) ? (value as RecurringPotential) : "Low";
}

export function blendAnalysis(extracted: ExtractedListing, listingCount: number, llm?: Record<string, unknown>): FreightAnalysis {
  const rules = analyzeFreightOpportunity(extracted, listingCount);
  if (!llm) return rules;
  const llmScore = Number(llm.score);
  const score = Number.isFinite(llmScore) ? Math.max(0, Math.min(100, Math.round(rules.score * 0.4 + llmScore * 0.6))) : rules.score;
  let confidence: ScoreConfidence = rules.confidence;
  if (score >= 75 && extracted.phone) confidence = "HIGH";
  const why = capText(llm.why || rules.why, 600) || rules.why;
  const freightType = asFreightType(llm.freightType) !== "Unknown" ? asFreightType(llm.freightType) : rules.freightType;
  const recurringPotential = llm.recurringPotential ? asRecurring(llm.recurringPotential) : rules.recurringPotential;
  const openerCasual = capText(llm.openerCasual || rules.openerCasual, 400) || rules.openerCasual;
  const openerDirect = capText(llm.openerDirect || rules.openerDirect, 400) || rules.openerDirect;
  return {
    ...rules,
    score,
    confidence,
    why,
    freightType,
    recurringPotential,
    openerCasual,
    openerDirect,
    openerBusiness: capText(llm.openerBusiness || rules.openerBusiness, 400) || rules.openerBusiness,
    openerShort: capText(llm.openerShort || rules.openerShort, 280) || rules.openerShort,
    openerFollowUp: capText(llm.openerFollowUp || rules.openerFollowUp, 400) || rules.openerFollowUp,
  };
}

const EXTRACT_SYSTEM = `You classify heavy-equipment and machinery listings for a one-person freight broker.
Return JSON only. Never invent a phone, email, website, or address that is not in the listing text.
Empty string or null if unknown.
Fields: title, sellerName, city, state (2-letter US), askingPrice (number or null), phone, email, website, category, equipmentType, dimensions, weight, pickupLocation, destination, isDealer (boolean), skip (boolean), skipReason, score (0-100 how likely they need freight and will reply), why, freightType (Flatbed|Hotshot|Vehicle Transport|Specialized / Oversized|LTL|FTL|Dry Van|Reefer|Unknown), recurringPotential (High|Medium|Low), openerCasual, openerDirect, openerBusiness, openerShort, openerFollowUp.
Score high for dealers, yards, auctions, rental houses, and $3k+ machines. Score low for couches, phones, clothes.
Openers are 1-2 sentences, casual, as if messaging the seller about transport. You do not send the message.`;

export async function enrichCapture(payload: CapturePayload, listingCount = 1): Promise<{
  extracted: ExtractedListing;
  analysis: FreightAnalysis;
  provider: LlmProvider;
  skipped: boolean;
  skipReason: string;
}> {
  const llm = await llmJson(EXTRACT_SYSTEM, JSON.stringify({
    url: payload.url || "",
    title: payload.title || "",
    sellerName: payload.sellerName || "",
    location: payload.location || "",
    price: payload.price ?? "",
    listing: capText(payload.description || payload.pageText || "", 6000),
  }));
  const extracted = mergeExtracted(payload, llm?.data);
  const analysis = blendAnalysis(extracted, listingCount, llm?.data);
  const skipped = Boolean(llm?.data?.skip) && analysis.score < 40;
  return {
    extracted,
    analysis,
    provider: llm?.provider || "rules",
    skipped,
    skipReason: capText(llm?.data?.skipReason || "", 200),
  };
}

export async function llmCopilotAnswer(digest: string, question: string, fallback: string) {
  const result = await llmText(
    "You are a freight desk copilot. Answer ONLY from the workspace digest. If the digest does not contain the answer, say so and use the fallback. No invented numbers or names.",
    `Question: ${question}\n\nFallback:\n${fallback}\n\nWorkspace digest:\n${digest}`,
  );
  return result;
}

export { generateOpeningMessage };

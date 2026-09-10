import type { CapturePayload } from "./freight";

const BLOCKED = /^(169\.254\.169\.254|metadata\.google\.internal)$/i;
const ARRAY_KEYS = ["data", "results", "items", "records", "dealers", "locations", "loads", "customers", "yards", "shippers", "leads", "carriers"];

export type CompanyApiAuth = "none" | "bearer" | "query";

export function allowedCompanyApiUrl(value: string) {
  let url: URL;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    return { ok: false as const, error: "Paste a full URL, like https://example.com/api/locations" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false as const, error: "Only http or https. This is a JSON API, not a scrape." };
  }
  if (BLOCKED.test(url.hostname)) return { ok: false as const, error: "That host is not allowed." };
  return { ok: true as const, url };
}

export function companyRequestUrl(base: string, auth: CompanyApiAuth, key: string) {
  const parsed = allowedCompanyApiUrl(base);
  if (!parsed.ok) return parsed;
  if (auth === "query" && key.trim()) parsed.url.searchParams.set("api_key", key.trim());
  return { ok: true as const, href: parsed.url.toString() };
}

export function companyRequestHeaders(auth: CompanyApiAuth, key: string) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (auth === "bearer" && key.trim()) headers.Authorization = `Bearer ${key.trim()}`;
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pick(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    let cur: unknown = row;
    for (const part of key.split(".")) {
      if (!isRecord(cur)) {
        cur = undefined;
        break;
      }
      cur = cur[part];
    }
    if (cur == null) continue;
    if (typeof cur === "object") continue;
    const text = String(cur).trim();
    if (text) return text;
  }
  return "";
}

export function jsonRecords(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json.filter(isRecord);
  if (!isRecord(json)) return [];
  for (const key of ARRAY_KEYS) {
    const value = json[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    if (isRecord(value) && Array.isArray(value.data)) return value.data.filter(isRecord);
  }
  if (pick(json, ["name", "company", "phone", "sellerName", "title"])) return [json];
  return [];
}

export function recordToCapture(row: Record<string, unknown>, sourceUrl: string): CapturePayload | null {
  const sellerName = pick(row, ["sellerName", "companyName", "dealer", "customer", "shipper", "legalName", "name", "company.name", "company", "title"]);
  const phone = pick(row, ["phone", "phoneNumber", "telephone", "tel", "dispatchPhone"]);
  const title = pick(row, ["title", "listingTitle", "commodity", "equipment", "name"]);
  const url = pick(row, ["url", "listingUrl", "sourceUrl", "href", "website"]);
  if (!sellerName && !title && !url && !phone) return null;
  const city = pick(row, ["city", "originCity", "cityName"]);
  const state = pick(row, ["state", "originState", "region"]);
  const location = pick(row, ["location", "address", "origin"]) || [city, state].filter(Boolean).join(", ");
  return {
    source: "Company API",
    url: url || sourceUrl,
    title: title || sellerName,
    description: pick(row, ["description", "notes", "about", "blurb"]),
    sellerName,
    sellerUrl: pick(row, ["sellerUrl", "website", "site"]),
    website: pick(row, ["website", "websiteUrl"]),
    phone,
    email: pick(row, ["email", "emailAddress"]),
    city,
    state,
    location,
    equipmentType: pick(row, ["equipmentType", "equipment", "trailer", "trailerType"]),
    dimensions: pick(row, ["dimensions", "dims"]),
    weight: pick(row, ["weight", "weightLbs"]),
    pickupLocation: pick(row, ["pickupLocation", "origin", "originCity"]),
    destination: pick(row, ["destination", "dest", "destinationCity"]),
    notes: pick(row, ["notes", "mc", "dot", "mcNumber"]).slice(0, 500),
    pageText: [sellerName, phone, location, title].filter(Boolean).join("\n"),
  };
}

export function previewCompanyFeed(json: unknown, sourceUrl: string) {
  const rows = jsonRecords(json);
  const mapped = rows.map((row) => recordToCapture(row, sourceUrl)).filter(Boolean);
  return {
    records: rows.length,
    usable: mapped.length,
    sampleKeys: rows[0] ? Object.keys(rows[0]).slice(0, 12) : [],
    sampleName: mapped[0]?.sellerName || mapped[0]?.title || "",
  };
}

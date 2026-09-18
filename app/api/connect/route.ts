import { cookies } from "next/headers";
import { validSession } from "@/lib/auth";
import {
  allowedCompanyApiUrl,
  companyRequestHeaders,
  companyRequestUrl,
  jsonRecords,
  previewCompanyFeed,
  recordToCapture,
  type CompanyApiAuth,
} from "@/lib/connect";
import { ingestCapture } from "@/lib/freight";
import { jsonError, jsonOk, logError } from "@/lib/http";
import { loadAzimuth, saveAzimuth } from "@/lib/workspace-io";

const MAX_BYTES = 200_000;
const MAX_ROWS = 40;

async function requireSession() {
  const ok = await validSession(cookies().get("lumen_session")?.value);
  if (!ok) return jsonError("Unauthorized", 401);
  return null;
}

function authOf(value: unknown): CompanyApiAuth {
  return value === "bearer" || value === "query" ? value : "none";
}

async function fetchFeed(url: string, auth: CompanyApiAuth, key: string) {
  const built = companyRequestUrl(url, auth, key);
  if (!built.ok) return { ok: false as const, error: built.error };
  const allowed = allowedCompanyApiUrl(built.href);
  if (!allowed.ok) return { ok: false as const, error: allowed.error };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(built.href, {
      method: "GET",
      headers: companyRequestHeaders(auth, key),
      signal: controller.signal,
      redirect: "follow",
    });
    const text = await res.text();
    if (text.length > MAX_BYTES) return { ok: false as const, error: "Response is too large. Use a JSON list endpoint, not a full site dump." };
    const type = res.headers.get("content-type") || "";
    if (!res.ok) return { ok: false as const, error: `Company API returned ${res.status}. Check the URL and key.` };
    if (/html/i.test(type) || /^\s*</.test(text)) {
      return { ok: false as const, error: "That URL is a web page. Paste a JSON endpoint, or use Discover paste for a listing you opened." };
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false as const, error: "Response was not JSON. Haul only reads a free REST/JSON API." };
    }
    return { ok: true as const, json, href: built.href };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false as const, error: "Company API timed out." };
    return { ok: false as const, error: "Could not reach that URL." };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  return jsonOk({
    inbound: "POST /api/prospects/capture",
    inboundBody: { sellerName: "Yard name", phone: "published phone only", city: "Houston", state: "TX", url: "https://their-site/listing" },
    outbound: "POST /api/connect with { action: probe|pull, url, auth, key }",
    note: "JSON only. No scrape. No DAT. Optional CAPTURE_TOKEN for inbound.",
  });
}

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  let body: { action?: string; url?: string; auth?: string; key?: string };
  try {
    body = (await request.json()) as { action?: string; url?: string; auth?: string; key?: string };
  } catch {
    return jsonError("JSON body required", 400);
  }
  const auth = authOf(body.auth);
  const url = String(body.url || "").trim();
  const key = String(body.key || "");
  const fetched = await fetchFeed(url, auth, key);
  if (!fetched.ok) return jsonError(fetched.error, 400);
  const preview = previewCompanyFeed(fetched.json, fetched.href);
  if (body.action === "probe") {
    return jsonOk({
      action: "probe",
      records: preview.records,
      usable: preview.usable,
      sampleKeys: preview.sampleKeys,
      sampleName: preview.sampleName,
    });
  }
  if (body.action !== "pull") return jsonError("action must be probe or pull", 400);
  if (!preview.usable) return jsonError("JSON loaded, but no name, phone, or title fields to save. Ask the desk for their locations/customers endpoint.", 422);
  try {
    const { workspace } = await loadAzimuth();
    let next = workspace;
    let created = 0;
    let merged = 0;
    const rows = jsonRecords(fetched.json).slice(0, MAX_ROWS);
    for (const row of rows) {
      const payload = recordToCapture(row, fetched.href);
      if (!payload) continue;
      const result = ingestCapture(next, payload);
      next = result.workspace;
      if (result.duplicate || result.updated) merged += 1;
      else created += 1;
    }
    const saved = await saveAzimuth(next);
    return jsonOk({ action: "pull", created, merged, usable: preview.usable, updatedAt: saved.updatedAt, revision: saved.revision });
  } catch (error) {
    logError("POST /api/connect", error);
    return jsonError("Could not save pulled records", 500);
  }
}

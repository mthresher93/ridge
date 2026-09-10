import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { detectPossibleDuplicate, extractListingData, ingestCapture } from "@/lib/freight";
import { enrichCapture } from "@/lib/freight-llm";
import { captureAllowed, validSession } from "@/lib/auth";
import { corsHeaders, corsJson, logError } from "@/lib/http";
import { parseCapturePayload, type CaptureInput } from "@/lib/validate";
import { loadAzimuth, saveAzimuth, WorkspaceConflictError } from "@/lib/workspace-io";

function captureResponse(result: ReturnType<typeof ingestCapture>, extra: Record<string, unknown>, updatedAt: string, revision: number) {
  return corsJson({
    ok: true,
    duplicate: result.duplicate,
    updated: result.updated,
    leadId: result.lead.id,
    listingId: result.listing.id,
    score: result.analysis.score,
    confidence: result.analysis.confidence,
    freightType: result.analysis.freightType,
    recurringPotential: result.analysis.recurringPotential,
    why: result.analysis.why,
    opener: result.analysis.openerCasual,
    known: result.analysis.known,
    estimates: result.analysis.estimates,
    unknown: result.analysis.unknown,
    phone: result.lead.phone || "",
    email: result.lead.email || "",
    sellerName: result.lead.name,
    updatedAt,
    revision,
    ...extra,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  const sessionOk = await validSession(cookies().get("lumen_session")?.value);
  if (!captureAllowed(request, sessionOk)) {
    return corsJson({ ok: false, error: "Unauthorized" }, 401);
  }

  const length = Number(request.headers.get("content-length") || 0);
  if (length > 400_000) return corsJson({ ok: false, error: "Payload too large" }, 413);
  let body: CaptureInput;
  try {
    body = (await request.json()) as CaptureInput;
  } catch {
    return corsJson({ ok: false, error: "JSON body required" }, 400);
  }
  const capture = parseCapturePayload(body);
  if (!capture.ok) return corsJson({ ok: false, error: capture.error }, 400);

  try {
    const { workspace } = await loadAzimuth();
    const preview = extractListingData(capture.payload);
    const dup = detectPossibleDuplicate(workspace, preview);
    const listingCount = Math.max(1, (workspace.listings || []).filter((item) => item.leadId === dup?.lead.id).length);
    const enriched = await enrichCapture(capture.payload, listingCount);
    const result = ingestCapture(workspace, capture.payload, { extracted: enriched.extracted, analysis: enriched.analysis });
    const saved = await saveAzimuth(result.workspace);
    return captureResponse(result, { provider: enriched.provider, skipped: enriched.skipped, skipReason: enriched.skipReason }, saved.updatedAt, saved.revision);
  } catch (error) {
    if (error instanceof WorkspaceConflictError) {
      try {
        const enriched = await enrichCapture(capture.payload, 1);
        const retry = ingestCapture(error.workspace, capture.payload, { extracted: enriched.extracted, analysis: enriched.analysis });
        const saved = await saveAzimuth(retry.workspace);
        return captureResponse(retry, { provider: enriched.provider }, saved.updatedAt, saved.revision);
      } catch (retryError) {
        logError("POST /api/prospects/capture retry", retryError);
        return corsJson({ ok: false, error: "Capture conflicted with another save. Retry." }, 409);
      }
    }
    logError("POST /api/prospects/capture", error);
    return corsJson({ ok: false, error: "Could not save prospect" }, 500);
  }
}

export async function GET() {
  return corsJson({
    ok: true,
    usage: "POST JSON { source, url, title, description, price, location, sellerName, sellerUrl, pageText }",
  });
}

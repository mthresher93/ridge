import { analyzeFreightOpportunity, extractListingData, generateFollowUp, generateOpeningMessage, type MessageStyle } from "@/lib/freight";
import { enrichCapture } from "@/lib/freight-llm";
import { jsonError, jsonOk, logError, readJson } from "@/lib/http";
import { parseCapturePayload, type CaptureInput } from "@/lib/validate";
import { loadAzimuth } from "@/lib/workspace-io";

export async function POST(request: Request) {
  const parsed = await readJson<{ leadId?: string; style?: MessageStyle; payload?: CaptureInput }>(request);
  if (!parsed.ok) return parsed.response;
  const style = parsed.body.style || "Casual";

  try {
    if (parsed.body.payload) {
      const capture = parseCapturePayload(parsed.body.payload);
      if (!capture.ok) return jsonError(capture.error, 400);
      const enriched = await enrichCapture(capture.payload);
      return jsonOk({
        extracted: enriched.extracted,
        analysis: enriched.analysis,
        opener: generateOpeningMessage(enriched.analysis, style),
        provider: enriched.provider,
        skipped: enriched.skipped,
        skipReason: enriched.skipReason,
      });
    }

    if (!parsed.body.leadId) return jsonError("leadId or payload required", 400);
    const { workspace } = await loadAzimuth();
    const lead = workspace.leads.find((item) => item.id === parsed.body.leadId);
    if (!lead) return jsonError("prospect not found", 404);
    const analysis = (workspace.analyses || []).find((item) => item.leadId === lead.id);
    const opener = analysis ? generateOpeningMessage(analysis, style) : generateFollowUp(lead);
    return jsonOk({
      score: lead.freightScore,
      confidence: lead.scoreConfidence,
      why: lead.scoreWhy,
      freightType: lead.freightType,
      recurringPotential: lead.recurringPotential,
      opener,
      provider: "rules",
    });
  } catch (error) {
    logError("POST /api/ai/analyze", error);
    const fallback = parsed.body.payload ? parseCapturePayload(parsed.body.payload) : null;
    if (fallback?.ok) {
      const extracted = extractListingData(fallback.payload);
      const analysis = analyzeFreightOpportunity(extracted);
      return jsonOk({ extracted, analysis, opener: generateOpeningMessage(analysis, style), provider: "rules" });
    }
    return jsonError("Could not analyze listing", 500);
  }
}

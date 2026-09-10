import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, logError } from "@/lib/http";
import { llmStatus } from "@/lib/llm";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const ai = await llmStatus();
    return jsonOk({ status: "ok", db: "ok", ai: ai.provider, aiReady: ai.ready, aiDetail: ai.ollama.detail });
  } catch (error) {
    logError("GET /api/health", error);
    return jsonError("Database unavailable", 503);
  }
}

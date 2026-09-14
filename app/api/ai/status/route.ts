import { jsonOk } from "@/lib/http";
import { llmStatus, llmConfig } from "@/lib/llm";
import { captureBookmarklet } from "@/lib/hunt";
import { authRequired } from "@/lib/auth";

export async function GET() {
  const status = await llmStatus();
  const origin = process.env.APP_ORIGIN || "http://localhost:6793";
  const tokenRequired = authRequired() || Boolean(process.env.CAPTURE_TOKEN);
  return jsonOk({
    ...status,
    config: llmConfig(),
    tokenRequired,
    bookmarklet: captureBookmarklet(origin, ""),
    pull: `ollama pull ${llmConfig().ollamaModel}`,
  });
}

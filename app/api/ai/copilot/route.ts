import { jsonError, jsonOk, logError, readJson } from "@/lib/http";
import { parseCopilotQuestion } from "@/lib/validate";
import { answerCopilot, workspaceDigest } from "@/lib/freight-copilot";
import { llmCopilotAnswer } from "@/lib/freight-llm";
import { loadAzimuth } from "@/lib/workspace-io";

export async function POST(request: Request) {
  const parsed = await readJson<{ question?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const question = parseCopilotQuestion(parsed.body);
  if (!question.ok) return jsonError(question.error, 400);
  try {
    const { workspace } = await loadAzimuth();
    const local = answerCopilot(workspace, question.question);
    const llm = await llmCopilotAnswer(workspaceDigest(workspace), question.question, local.answer);
    if (llm?.text) return jsonOk({ answer: llm.text, matches: local.matches, provider: llm.provider });
    return jsonOk({ ...local, provider: "rules" });
  } catch (error) {
    logError("POST /api/ai/copilot", error);
    return jsonError("Copilot could not read the workspace", 500);
  }
}

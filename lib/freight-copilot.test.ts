import { describe, expect, it } from "vitest";
import { answerCopilot } from "./freight-copilot";
import { emptyWorkspace, createSeed } from "./seed";

describe("answerCopilot", () => {
  it("asks for a real question on blank input", () => {
    const result = answerCopilot(emptyWorkspace(), "  ");
    expect(result.answer).toMatch(/Ask about/i);
  });

  it("answers from live workspace data, not a canned script", () => {
    const workspace = createSeed();
    const result = answerCopilot(workspace, "who should I follow up with today");
    expect(result.answer.length).toBeGreaterThan(10);
    expect(result.answer).not.toMatch(/I couldn't parse/i);
  });

  it("answers trailer questions from training specs, not the pipeline", () => {
    const result = answerCopilot(emptyWorkspace(), "what trailer for a sleeper cab");
    expect(result.answer).toMatch(/RGN|lowboy/i);
  });
});

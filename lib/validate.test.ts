import { describe, expect, it } from "vitest";
import { parseCapturePayload, parseCopilotQuestion, parseMoney } from "./validate";

describe("parseCapturePayload", () => {
  it("rejects empty payloads", () => {
    expect(parseCapturePayload({}).ok).toBe(false);
  });

  it("caps oversized text", () => {
    const parsed = parseCapturePayload({ title: "Forklift", description: "x".repeat(9000) });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.payload.description.length).toBe(4000);
  });
});

describe("parseCopilotQuestion", () => {
  it("requires a question", () => {
    expect(parseCopilotQuestion({ question: "   " }).ok).toBe(false);
  });
});

describe("parseMoney", () => {
  it("accepts valid rates and rejects junk", () => {
    expect(parseMoney("4750.25")).toBe(4750.25);
    expect(parseMoney(-1)).toBeNull();
    expect(parseMoney("nope")).toBeNull();
    expect(parseMoney(2_000_000)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { extractCarrierFacts, ingestCarrier, isCallablePhone } from "./carriers";
import { emptyWorkspace } from "./seed";

describe("isCallablePhone", () => {
  it("accepts a published local yard phone", () => {
    expect(isCallablePhone("214-342-6700")).toBe(true);
  });

  it("rejects toll-free and 555 placeholders", () => {
    expect(isCallablePhone("800-667-9328")).toBe(false);
    expect(isCallablePhone("(214) 555-0100")).toBe(false);
  });
});

describe("extractCarrierFacts", () => {
  it("pulls MC, DOT, and a local phone from a pasted page", () => {
    const facts = extractCarrierFacts(`
Desert Hotshot LLC
MC-123456
USDOT 987654
Dispatch (432) 555-0199
Phone (432) 758-4410
`);
    expect(facts.mc).toBe("123456");
    expect(facts.dot).toBe("987654");
    expect(facts.phone).toMatch(/758-4410/);
    expect(facts.phone).not.toMatch(/555-0199/);
  });

  it("does not invent an MC when the page has none", () => {
    const facts = extractCarrierFacts("Acme Trucking. Call us for a quote.");
    expect(facts.mc).toBe("");
    expect(facts.dot).toBe("");
  });
});

describe("ingestCarrier", () => {
  it("merges the same MC instead of duplicating", () => {
    const first = ingestCarrier(emptyWorkspace(), extractCarrierFacts("Acme LLC MC-111222 DOT 333444 806-745-4201"));
    const second = ingestCarrier(first.workspace, extractCarrierFacts("Acme LLC MC-111222 806-745-4201"));
    expect(second.duplicate).toBe(true);
    expect(second.workspace.carriers).toHaveLength(1);
  });
});

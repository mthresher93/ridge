import { describe, expect, it } from "vitest";
import { combineUnits, loadedHeight } from "./freight-math";

describe("combineUnits", () => {
  it("adds two trucks end to end", () => {
    const a = { lengthFt: 26, widthFt: 8, heightFt: 9.5, weightLbs: 20000 };
    const combined = combineUnits([a, a], "end-to-end");
    expect(combined.lengthFt).toBe(52);
    expect(combined.widthFt).toBe(8);
    expect(combined.heightFt).toBe(9.5);
    expect(combined.weightLbs).toBe(40000);
  });

  it("warns when side-by-side exceeds legal width", () => {
    const a = { lengthFt: 20, widthFt: 8, heightFt: 8, weightLbs: 10000 };
    const combined = combineUnits([a, a], "side-by-side");
    expect(combined.widthFt).toBe(16);
    expect(combined.warnings.join(" ")).toMatch(/8\.5/);
  });
});

describe("loadedHeight", () => {
  it("adds deck and cargo and flags oversize against the highway reference", () => {
    const result = loadedHeight(5, 10);
    expect(result.loadedFt).toBe(15);
    expect(result.oversize).toBe(true);
    expect(result.note).toMatch(/confirm origin and destination states/i);
  });
});

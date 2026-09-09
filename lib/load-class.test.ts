import { describe, expect, it } from "vitest";
import { classifyLoad, classifyWhy } from "./load-class";

describe("classifyLoad", () => {
  it("takes the larger band when length says Parcel and weight says LTL", () => {
    expect(classifyLoad(10, 32000, "53")).toBe("LTL");
    expect(classifyWhy(10, 32000, "53").why).toMatch(/Final: LTL/);
  });

  it("classifies 53' equipment by the published length and weight bands", () => {
    expect(classifyLoad(9, 9000, "53")).toBe("Parcel");
    expect(classifyLoad(18, 18000, "53")).toBe("Partial");
    expect(classifyLoad(30, 30000, "53")).toBe("LTL");
    expect(classifyLoad(40, 40000, "53")).toBe("TL");
  });

  it("classifies hot shot by the published bands", () => {
    expect(classifyLoad(4, 2000, "hotshot")).toBe("Parcel");
    expect(classifyLoad(12, 8000, "hotshot")).toBe("Partial");
    expect(classifyLoad(26, 18000, "hotshot")).toBe("TL");
  });
});

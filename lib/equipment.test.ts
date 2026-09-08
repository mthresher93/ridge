import { describe, expect, it } from "vitest";
import { applySpecsToLead, cheaperFails, checkTrailer, parseDimensions, parsePounds, recommendEquipment, trailerCap } from "./equipment";
import { blankProspect } from "./freight";

describe("recommendEquipment", () => {
  it("treats 26x8.5x10 at 18k as hotshot TL", () => {
    const fit = recommendEquipment({ dimensions: "26 x 8.5 x 10", weight: "18000 lb" });
    expect(fit.trailer).toBe("HS");
    expect(fit.loadClass).toBe("TL");
    expect(fit.checks.find((item) => item.code === "HS")?.pass).toBe(true);
  });

  it("keeps 10.5' cargo on hotshot, not a step deck", () => {
    const fit = recommendEquipment({ lengthFt: 26, widthFt: 8.5, heightFt: 10.5, weightLbs: 18000 });
    expect(fit.trailer).toBe("HS");
  });

  it("sends a sleeper cab to RGN", () => {
    const fit = recommendEquipment({ text: "sleeper cab" });
    expect(fit.trailer).toBe("RGN");
    expect(fit.loadClass).toBe("Always TL");
    expect(fit.checks.find((item) => item.code === "HS")?.pass).toBe(false);
  });

  it("does not put 28k lb on a hotshot", () => {
    const fit = recommendEquipment({ dimensions: "24 x 8.5 x 10", weight: "28000 lb" });
    expect(fit.trailer).not.toBe("HS");
    expect(fit.trailer).toBe("SDL");
  });

  it("does not treat a L×W×H string as pounds", () => {
    expect(parsePounds("26 x 8.5 x 10")).toBeNull();
    const fit = recommendEquipment({ dimensions: "26 x 8.5 x 10" });
    expect(fit.weightLbs).toBeNull();
  });

  it("converts inch measurements that look like 312 x 102 x 120", () => {
    const parsed = parseDimensions("312 x 102 x 120");
    expect(parsed.lengthFt).toBe(26);
    expect(parsed.widthFt).toBe(8.5);
    expect(parsed.heightFt).toBe(10);
    const fit = recommendEquipment({ dimensions: "312 x 102 x 120", weight: "18000 lb" });
    expect(fit.trailer).toBe("HS");
  });

  it("leaves true feet alone", () => {
    const parsed = parseDimensions("26 x 8.5 x 10");
    expect(parsed).toEqual({ lengthFt: 26, widthFt: 8.5, heightFt: 10 });
  });

  it("fails hotshot in the check list when height needs a well", () => {
    const fit = recommendEquipment({ text: "sleeper", lengthFt: 28, widthFt: 8, heightFt: 13, weightLbs: 20000 });
    expect(fit.trailer).toBe("RGN");
    const hs = fit.checks.find((item) => item.code === "HS");
    expect(hs?.pass).toBe(false);
    expect(hs?.fails.join(" ")).toMatch(/Height/i);
    expect(fit.alsoFits).toContain("RGNE");
  });

  it("uses RGN well length, not a 53' deck, for a long low unit", () => {
    const rgn = trailerCap("RGN");
    expect(rgn?.maxLengthFt).toBe(30);
    const check = checkTrailer(rgn!, { lengthFt: 38, widthFt: 8, heightFt: 12, weightLbs: 32000 });
    expect(check.pass).toBe(false);
    const fit = recommendEquipment({ text: "school bus", lengthFt: 38, widthFt: 8, heightFt: 12, weightLbs: 32000 });
    expect(fit.trailer).toBe("RGNE");
  });

  it("does not downspec a catalog RGN unit onto LSDL just because height is 10.5'", () => {
    const fit = recommendEquipment({ text: "school bus" });
    expect(fit.trailer).toBe("RGNE");
    expect(fit.trailer).not.toBe("LSDL");
    expect(fit.trailer).not.toBe("HS");
  });

  it("lists cheaper decks that failed so a beginner can see why not hotshot", () => {
    const fit = recommendEquipment({ text: "sleeper cab" });
    const skipped = cheaperFails(fit);
    expect(skipped.some((item) => item.code === "HS")).toBe(true);
    expect(skipped.find((item) => item.code === "HS")?.fails.join(" ")).toMatch(/Height/i);
  });

  it("does not invent a deck when no unit or numbers are given", () => {
    const fit = recommendEquipment({});
    expect(fit.trailer).toBe("UNKNOWN");
    expect(fit.usedGuess).toBe(false);
    expect(fit.why).toMatch(/Need length/i);
  });

  it("trusts typed numbers over the unit nickname", () => {
    const fit = recommendEquipment({ text: "sleeper cab", lengthFt: 12, widthFt: 6, heightFt: 8, weightLbs: 9000 });
    expect(fit.trailer).toBe("HS");
    expect(fit.ask.join(" ")).toMatch(/numbers say/i);
  });
});

describe("applySpecsToLead", () => {
  it("refuses to save a catalog nickname as measured specs", () => {
    const result = applySpecsToLead(blankProspect("Michael", { name: "Yard" }), { unit: "sleeper cab" });
    expect(result.saved).toBe(false);
    expect(result.lead.dimensions).toBe("");
  });

  it("writes typed L×W×H onto the client", () => {
    const result = applySpecsToLead(blankProspect("Michael", { name: "Yard" }), {
      lengthFt: 26,
      widthFt: 8.5,
      heightFt: 10,
      weightLbs: 18000,
      unit: "forklift",
    });
    expect(result.saved).toBe(true);
    expect(result.lead.dimensions).toBe("26 x 8.5 x 10");
    expect(result.lead.weight).toBe("18000");
    expect(result.lead.trailerHint).toMatch(/Hot Shot/i);
  });
});

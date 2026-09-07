import { describe, expect, it } from "vitest";
import { captureBookmarklet, HUNT_LANES, HUNT_PLAYS, huntPack, huntPackText, huntPlaceParts, huntSearchUrl } from "./hunt";

describe("huntSearchUrl", () => {
  it("builds public search URLs the user opens themselves", () => {
    expect(huntSearchUrl("machinery-trader", "skid steer", "Texas")).toContain("machinerytrader.com");
    expect(huntSearchUrl("mt-dealers", "forklift", "TX")).toContain("machinerytrader.com/dealer/directory");
    expect(huntSearchUrl("facebook", "forklift", "TX")).toContain("facebook.com/marketplace");
    expect(huntSearchUrl("maps-dealers", "forklift dealer", "Dallas TX")).toContain("google.com/maps");
    expect(huntSearchUrl("maps-rental", "forklift", "Dallas TX")).toContain("equipment%20rental");
    expect(huntSearchUrl("craigslist", "forklift", "Dallas")).toContain("craigslist.org/search/hvy");
    expect(huntSearchUrl("linkedin-yards", "forklift", "Texas")).toContain("linkedin.com/search/results/companies");
    expect(huntSearchUrl("importyeti")).toBe("https://www.importyeti.com/");
    expect(huntSearchUrl("copart", "forklift", "TX")).toContain("copart.com");
    expect(huntSearchUrl("bobcat-locator")).toContain("bobcat.com");
    expect(huntSearchUrl("truck-paper", "dump", "IL")).toContain("truckpaper.com");
  });
});

describe("huntPlaceParts", () => {
  it("reads a state from a city string", () => {
    expect(huntPlaceParts("Dallas TX").state).toBe("TX");
    expect(huntPlaceParts("Texas").state).toBe("TX");
  });
});

describe("huntPack", () => {
  it("orders yards and inventory before auctions", () => {
    const pack = huntPack("forklift", "Texas");
    expect(pack.map((item) => item.id)).toEqual(["mt-dealers", "maps-dealers", "machinery-trader", "maps-rental", "ritchie"]);
    expect(huntPackText("forklift", "Texas")).toContain("machinerytrader.com");
  });
});

describe("HUNT_PLAYS", () => {
  it("only points at real lanes", () => {
    const ids = new Set(HUNT_LANES.map((lane) => lane.id));
    for (const play of HUNT_PLAYS) {
      for (const laneId of play.laneIds) {
        expect(ids.has(laneId)).toBe(true);
        expect(huntSearchUrl(laneId, "forklift", "Texas")).toMatch(/^https:\/\//);
      }
    }
  });
});

describe("captureBookmarklet", () => {
  it("posts to the local capture API", () => {
    const code = captureBookmarklet("http://localhost:6793");
    expect(code.startsWith("javascript:")).toBe(true);
    expect(code).toContain("/api/prospects/capture");
    expect(code).toContain("pageText");
    expect(code).toContain("Haul saved");
    expect(code).toContain("/outreach?id=");
  });
});

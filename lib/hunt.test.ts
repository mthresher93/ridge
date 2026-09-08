import { describe, expect, it } from "vitest";
import { captureBookmarklet, HUNT_LANES, HUNT_PLAYS, huntPack, huntPackText, huntPlaceParts, huntQueue, huntSearchUrl, sourceFromLane } from "./hunt";

describe("huntSearchUrl", () => {
  it("builds public search URLs the user opens themselves", () => {
    expect(huntSearchUrl("machinery-trader", "skid steer", "Texas")).toContain("machinerytrader.com");
    expect(huntSearchUrl("mt-dealers", "forklift", "TX")).toContain("machinerytrader.com");
    expect(huntSearchUrl("facebook", "forklift", "TX")).toContain("facebook.com/marketplace");
    expect(huntSearchUrl("maps-dealers", "forklift dealer", "Dallas TX")).toContain("google.com/maps");
    expect(huntSearchUrl("maps-rental", "forklift", "Dallas TX")).toContain("equipment%20rental");
    expect(huntSearchUrl("craigslist", "forklift", "Dallas")).toContain("craigslist.org/search/hvy");
    expect(huntSearchUrl("linkedin-yards", "forklift", "Texas")).toContain("linkedin.com/search/results/companies");
    expect(huntSearchUrl("importyeti")).toBe("https://www.importyeti.com/");
    expect(huntSearchUrl("copart", "forklift", "TX")).toContain("copart.com");
    expect(huntSearchUrl("bobcat-locator")).toContain("bobcat.com");
    expect(huntSearchUrl("truck-paper", "dump", "IL")).toContain("truckpaper.com");
    expect(huntSearchUrl("komatsu-locator")).toContain("komatsuamerica.com");
    expect(huntSearchUrl("herc")).toContain("hercrentals.com");
    expect(huntSearchUrl("maps-excavating", "forklift", "Dallas TX")).toContain("excavating");
    expect(huntSearchUrl("govdeals", "forklift", "Texas")).toContain("govdeals.com");
    expect(huntSearchUrl("gsa-auctions")).toContain("gsaauctions.gov");
  });
});

describe("huntPlaceParts", () => {
  it("reads a state from a city string", () => {
    expect(huntPlaceParts("Dallas TX").state).toBe("TX");
    expect(huntPlaceParts("Texas").state).toBe("TX");
    expect(huntPlaceParts("Miami Florida").state).toBe("FL");
  });
});

describe("huntPack", () => {
  it("orders yards and inventory before auctions", () => {
    const pack = huntPack("forklift", "Texas");
    expect(pack.map((item) => item.id)).toEqual(["mt-dealers", "maps-dealers", "machinery-trader", "maps-rental", "ritchie"]);
    expect(huntPackText("forklift", "Texas")).toContain("machinerytrader.com");
  });

  it("narrows the pack to the selected play", () => {
    const pack = huntPack("skid steer", "Florida", "rental");
    expect(pack.map((item) => item.id)).toEqual(["maps-rental", "sunbelt", "united-rentals", "herc", "he-rental"]);
  });
});

describe("huntQueue", () => {
  it("rotates real public searches by calendar day", () => {
    const monday = huntQueue(new Date("2026-09-07T12:00:00"), 12);
    const tuesday = huntQueue(new Date("2026-09-08T12:00:00"), 12);
    expect(monday).toHaveLength(12);
    expect(new Set(monday.map((item) => item.url)).size).toBeGreaterThan(6);
    for (const item of monday) {
      expect(item.url).toMatch(/^https:\/\//);
      expect(item.place).toMatch(/[A-Z]{2}$/);
      expect(item.query.length).toBeGreaterThan(2);
    }
    expect(monday[0].place).toMatch(/TX$/);
    expect(tuesday[0].id).not.toBe(monday[0].id);
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

describe("sourceFromLane", () => {
  it("maps a hunt lane to a real source label", () => {
    expect(sourceFromLane("maps-dealers")).toBe("Google");
    expect(sourceFromLane("machinery-trader")).toBe("Machinery Trader");
    expect(sourceFromLane("ritchie")).toBe("Auction");
    expect(sourceFromLane("facebook")).toBe("Facebook Marketplace");
  });
});

describe("captureBookmarklet", () => {
  it("posts to the local capture API", () => {
    const code = captureBookmarklet("http://localhost:6793");
    expect(code.startsWith("javascript:")).toBe(true);
    expect(code).toContain("/api/prospects/capture");
    expect(code).toContain("pageText");
    expect(code).toContain("Move' saved");
    expect(code).toContain("/outreach?id=");
  });
});

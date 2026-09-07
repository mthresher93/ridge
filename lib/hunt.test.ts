import { describe, expect, it } from "vitest";
import { captureBookmarklet, huntSearchUrl } from "./hunt";

describe("huntSearchUrl", () => {
  it("builds public search URLs the user opens themselves", () => {
    expect(huntSearchUrl("machinery-trader", "skid steer", "Texas")).toContain("machinerytrader.com");
    expect(huntSearchUrl("facebook", "forklift", "TX")).toContain("facebook.com/marketplace");
    expect(huntSearchUrl("maps-dealers", "forklift dealer", "Dallas TX")).toContain("google.com/maps");
    expect(huntSearchUrl("craigslist", "forklift", "Dallas")).toContain("craigslist.org/search/hvy");
  });
});

describe("captureBookmarklet", () => {
  it("posts to the local capture API", () => {
    const code = captureBookmarklet("http://localhost:6793");
    expect(code.startsWith("javascript:")).toBe(true);
    expect(code).toContain("/api/prospects/capture");
    expect(code).toContain("pageText");
  });
});

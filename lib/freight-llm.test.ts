import { describe, expect, it } from "vitest";
import { mergeExtracted } from "./freight-llm";

describe("mergeExtracted", () => {
  it("keeps a phone only when those digits appear in the pasted listing", () => {
    const extracted = mergeExtracted(
      {
        title: "Toyota forklift",
        description: "Call 214-351-4511 for this 5,000 lb forklift in Dallas TX",
        location: "Dallas, TX",
      },
      { phone: "214-351-4511", sellerName: "Westside Machinery", email: "fake@not-in-listing.com" },
    );
    expect(extracted.phone.replace(/\D/g, "")).toContain("2143514511");
    expect(extracted.email).toBe("");
  });

  it("drops an invented phone number", () => {
    const extracted = mergeExtracted(
      { title: "Skid steer", description: "Nice bobcat, local pickup" },
      { phone: "555-000-1111" },
    );
    expect(extracted.phone).toBe("");
  });
});

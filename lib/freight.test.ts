import { describe, expect, it } from "vitest";
import { analyzeFreightOpportunity, extractListingData, ingestCapture, suggestClientKind } from "./freight";
import { emptyWorkspace } from "./seed";

function score(text: string, extra: Record<string, string> = {}) {
  return analyzeFreightOpportunity(
    extractListingData({
      title: extra.title || text.slice(0, 80),
      description: text,
      location: extra.location || "Dallas, TX",
      price: extra.price || "12500",
      sellerName: extra.sellerName || "Westside Machinery",
      phone: extra.phone,
    }),
  );
}

describe("analyzeFreightOpportunity", () => {
  it("does not treat a forklift that can load on a trailer as vehicle transport", () => {
    const analysis = score("Toyota 8FGU25 forklift 5,000 lb. Can load on a trailer. Local pickup in Dallas.");
    expect(analysis.freightType).not.toBe("Vehicle Transport");
    expect(analysis.why).not.toMatch(/Vehicle or trailer transport/i);
    expect(analysis.score).toBeGreaterThanOrEqual(70);
  });

  it("scores household furniture as a weak freight lead", () => {
    const analysis = score("Ikea sofa couch for living room, like new", { title: "Couch", price: "90", sellerName: "Jane" });
    expect(analysis.score).toBeLessThan(40);
    expect(analysis.why).toMatch(/household/i);
  });

  it("treats motorcycle listings as vehicle transport", () => {
    const analysis = score("2018 Harley motorcycle for sale, runs great", { title: "Harley motorcycle", price: "8500", sellerName: "Mike" });
    expect(analysis.why).toMatch(/Vehicle or trailer transport/i);
  });
});

describe("ingestCapture", () => {
  it("merges a second listing with the same phone instead of creating a duplicate", () => {
    const first = ingestCapture(emptyWorkspace(), {
      title: "Toyota forklift",
      sellerName: "John’s Equipment",
      phone: "312-555-0140",
      location: "Chicago, IL",
    });
    const second = ingestCapture(first.workspace, {
      title: "Bobcat skid steer",
      sellerName: "Johns Equipment LLC",
      phone: "(312) 555-0140",
      location: "Chicago, IL",
    });
    expect(second.duplicate).toBe(true);
    expect(second.lead.id).toBe(first.lead.id);
    expect(second.workspace.leads).toHaveLength(1);
    expect(second.workspace.listings.length).toBeGreaterThanOrEqual(2);
  });

  it("does not invent a freight rate from the listing asking price", () => {
    const result = ingestCapture(emptyWorkspace(), {
      title: "Toyota forklift",
      sellerName: "Westside Machinery",
      phone: "214-555-0100",
      price: "18900",
      location: "Dallas, TX",
    });
    expect(result.lead.estimatedValue).toBe(0);
    expect(result.workspace.opportunities[0]?.value).toBe(0);
  });
});

describe("suggestClientKind", () => {
  it("suggests Dealer from an LLC name, not from the word forklift", () => {
    expect(suggestClientKind({ sellerName: "Hill Country Lift LLC", title: "Toyota forklift" })).toBe("Dealer");
    expect(suggestClientKind({ sellerName: "Jane", title: "Toyota forklift", source: "Manual" })).toBe("");
    expect(suggestClientKind({ source: "Facebook Marketplace", sellerName: "Mike" })).toBe("Private seller");
    expect(suggestClientKind({ source: "Auction", title: "Ritchie lot" })).toBe("Auction");
  });
});

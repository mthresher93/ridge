import { describe, expect, it } from "vitest";
import { analyzeFreightOpportunity, captureFacts, detectShipperRole, extractListingData, generateOpeningMessage, hasMeasuredSpecs, ingestCapture, suggestClientKind, trailerFact } from "./freight";
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

  it("keeps same-brand yards with different phones as separate clients", () => {
    const first = ingestCapture(emptyWorkspace(), {
      title: "Shoppa's Material Handling — Dallas / Fort Worth",
      sellerName: "Shoppa's Material Handling — Dallas / Fort Worth",
      phone: "817-359-1100",
      location: "Fort Worth, TX",
      url: "https://www.shoppasmaterialhandling.com/locations/",
      website: "https://www.shoppasmaterialhandling.com/",
    });
    const second = ingestCapture(first.workspace, {
      title: "Shoppa's Material Handling — Amarillo",
      sellerName: "Shoppa's Material Handling — Amarillo",
      phone: "806-358-1391",
      location: "Amarillo, TX",
      url: "https://www.shoppasmaterialhandling.com/locations/",
      website: "https://www.shoppasmaterialhandling.com/",
    });
    expect(second.duplicate).toBe(false);
    expect(second.lead.id).not.toBe(first.lead.id);
    expect(second.workspace.leads).toHaveLength(2);
  });

  it("does not reuse a collapsed brand lead when the yard phone is different", () => {
    const first = ingestCapture(emptyWorkspace(), {
      title: "Bobcat of Austin",
      sellerName: "Bobcat of Austin",
      phone: "512-251-3415",
      location: "Round Rock, TX",
      url: "https://www.bobcatcce.com/dealer-info/locations/bobcat-of-austin",
      website: "https://www.bobcatcce.com/",
    });
    const collapsed = {
      ...first.workspace,
      leads: first.workspace.leads.map((lead) =>
        lead.id === first.lead.id ? { ...lead, name: "Bobcat of San Antonio", phone: "210-337-6136", city: "San Antonio" } : lead,
      ),
    };
    const second = ingestCapture(collapsed, {
      title: "Bobcat of Austin",
      sellerName: "Bobcat of Austin",
      phone: "512-251-3415",
      location: "Round Rock, TX",
      url: "https://www.bobcatcce.com/dealer-info/locations/bobcat-of-austin",
      website: "https://www.bobcatcce.com/",
    });
    expect(second.duplicate).toBe(false);
    expect(second.lead.phone).toBe("512-251-3415");
    expect(second.workspace.leads).toHaveLength(2);
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

  it("pulls seller, city, phone, dims, and weight from a pasted dealer ad", () => {
    const result = ingestCapture(emptyWorkspace(), {
      description: `Toyota 8FGU25 forklift 5,000 lb
Westside Machinery LLC
Dallas, TX
Call (214) 555-0100
26 x 8.5 x 10
Asking $18,900
Can load on a trailer`,
    });
    expect(result.lead.name).toBe("Westside Machinery LLC");
    expect(result.lead.city).toBe("Dallas");
    expect(result.lead.state).toBe("TX");
    expect(result.lead.phone).toMatch(/214/);
    expect(result.lead.dimensions).toMatch(/26/);
    expect(result.lead.weight).toMatch(/5,000\s*lb/i);
    expect(result.lead.estimatedValue).toBe(0);
    expect(result.lead.askingPrice).toBe(18900);
  });
});

describe("suggestClientKind", () => {
  it("suggests Dealer from an LLC name, not from the word forklift", () => {
    expect(suggestClientKind({ sellerName: "Hill Country Lift LLC", title: "Toyota forklift" })).toBe("Dealer");
    expect(suggestClientKind({ sellerName: "Jane", title: "Toyota forklift", source: "Manual" })).toBe("");
    expect(suggestClientKind({ sellerName: "Briggs Equipment — Dallas", title: "Telehandler" })).toBe("Dealer");
    expect(suggestClientKind({ sellerName: "Toyota Lift of Houston (Doggett)", title: "Forklift" })).toBe("Dealer");
    expect(suggestClientKind({ source: "Facebook Marketplace", sellerName: "Mike" })).toBe("Private seller");
    expect(suggestClientKind({ source: "Auction", title: "Ritchie lot" })).toBe("Auction");
  });
});

describe("detectShipperRole", () => {
  it("ranks a dealer yard above a private Marketplace seller", () => {
    expect(detectShipperRole({ sellerName: "Hill Country Lift LLC", title: "Toyota forklift" })).toBe("Yard");
    expect(detectShipperRole({ source: "Facebook Marketplace", sellerName: "Mike", title: "Toyota forklift" })).toBe("Private");
    const yard = score("Toyota 8FGU25 forklift 5,000 lb", { sellerName: "Hill Country Lift LLC", price: "12500" });
    const privateSeller = score("Toyota 8FGU25 forklift 5,000 lb", { sellerName: "Mike", price: "12500" });
    expect(yard.shipperRole).toBe("Yard");
    expect(yard.score).toBeGreaterThan(privateSeller.score);
    expect(yard.trailerHint).toMatch(/Hot Shot|Step Deck/i);
  });
});

describe("generateOpeningMessage", () => {
  it("changes wording across sends so copies are not identical", () => {
    const analysis = score("Toyota forklift 5000 lb", { sellerName: "Westside Machinery LLC" });
    const a = generateOpeningMessage(analysis, "Casual", "lead-1", 0);
    const b = generateOpeningMessage(analysis, "Casual", "lead-1", 1);
    expect(a.length).toBeGreaterThan(20);
    expect(a).toMatch(/forklift/i);
    expect(a).not.toBe(b);
  });
});

describe("extractListingData", () => {
  it("does not invent a phone when none is on the page", () => {
    const extracted = extractListingData({
      description: "Toyota forklift in Dallas, TX. 9000 lb. 12 x 6 x 8. Asking $12,500.",
    });
    expect(extracted.phone).toBe("");
    expect(extracted.city).toBe("Dallas");
    expect(extracted.dimensions).toMatch(/12/);
    expect(extracted.weight).toMatch(/9000/);
    expect(extracted.askingPrice).toBe(12500);
    expect(captureFacts(extracted).some((item) => item.k === "Phone")).toBe(false);
  });

  it("reads a Maps dealer card without inventing a phone", () => {
    const extracted = extractListingData({
      pageText: `Hill Country Lift
4.8
(128)
Forklift dealer
4411 S Congress Ave
Austin, TX 78745
United States
(512) 555-0199
hillcountrylift.com
Directions
Website`,
      url: "https://www.google.com/maps/place/Hill+Country+Lift",
    });
    expect(extracted.sellerName).toBe("Hill Country Lift");
    expect(extracted.city).toBe("Austin");
    expect(extracted.state).toBe("TX");
    expect(extracted.phone).toMatch(/512/);
    expect(extracted.website).toMatch(/hillcountrylift\.com/i);
    expect(extracted.source).toBe("Google");
  });

  it("reads a company from Posted by and unitless LxWxH", () => {
    const extracted = extractListingData({
      pageText: "Posted by: Hill Country Lift LLC\nAustin, TX\n28 x 8 x 13\n20000 lb sleeper cab",
    });
    expect(extracted.sellerName).toBe("Hill Country Lift LLC");
    expect(extracted.city).toBe("Austin");
    expect(extracted.dimensions).toBe("28 x 8 x 13");
    expect(extracted.weight).toMatch(/20000/);
  });
});

describe("trailerFact", () => {
  it("does not present a catalog trailer as a measured fact", () => {
    expect(hasMeasuredSpecs({ dimensions: "", weight: "" })).toBe(false);
    expect(trailerFact({ dimensions: "", weight: "", trailerHint: "Hot Shot · Partial" })).toBe("Ask on the call");
    expect(trailerFact({ dimensions: "12 x 6 x 8", weight: "9000", trailerHint: "Hot Shot · Partial" })).toBe("Hot Shot · Partial");
  });
});

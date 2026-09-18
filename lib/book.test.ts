import { describe, expect, it } from "vitest";
import { bookCensus } from "./book";
import { blankProspect } from "./freight";

describe("bookCensus", () => {
  it("sections the book by source, metro, and seller vs yard", () => {
    const census = bookCensus([
      { ...blankProspect("Michael"), id: "a", name: "Yard A", city: "Houston", state: "TX", source: "Google", label: "Dealer", phone: "7135551212" },
      { ...blankProspect("Michael"), id: "b", name: "Pat", city: "Dallas", state: "TX", source: "Facebook Marketplace", label: "Private seller", phone: "2143514511" },
      { ...blankProspect("Michael"), id: "c", name: "Unnamed", city: "Austin", state: "TX", source: "Google", label: "", phone: "" },
    ]);
    expect(census.live).toBe(3);
    expect(census.sellers).toBe(1);
    expect(census.yards).toBe(1);
    expect(census.unlabeled).toBe(1);
    expect(census.sources[0].name).toBe("Google");
    expect(census.metros.length).toBeGreaterThan(0);
  });
});

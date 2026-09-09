import { describe, expect, it } from "vitest";
import { blankProspect } from "./freight";
import { emptyWorkspace, normalizeWorkspace } from "./seed";

describe("normalizeWorkspace", () => {
  it("keeps existing prospects instead of replacing them with sample data", () => {
    const incoming = emptyWorkspace();
    incoming.version = 1;
    incoming.leads = [blankProspect("Michael", { id: "lead-keep", name: "Keep Me", company: "Keep Co" })];
    const next = normalizeWorkspace(incoming);
    expect(next.version).toBe(3);
    expect(next.brand).toBe("azimuth");
    expect(next.leads.some((lead) => lead.id === "lead-keep")).toBe(true);
    expect(next.listings).toEqual([]);
  });

  it("archives 555 and example.com contacts so they never sit on the live desk", () => {
    const incoming = emptyWorkspace();
    incoming.leads = [
      blankProspect("Michael", { id: "lead-fake", name: "Westside Machinery LLC", phone: "(214) 555-0100", listingUrl: "https://example.com/listings/westside-lot" }),
      blankProspect("Michael", { id: "lead-real", name: "Briggs Equipment — Dallas", phone: "214-351-4511" }),
    ];
    const next = normalizeWorkspace(incoming);
    const fake = next.leads.find((lead) => lead.id === "lead-fake");
    const real = next.leads.find((lead) => lead.id === "lead-real");
    expect(fake?.archivedAt).toBeTruthy();
    expect(fake?.phone).toBe("");
    expect(real?.archivedAt).toBeFalsy();
    expect(real?.phone).toBe("214-351-4511");
  });
});

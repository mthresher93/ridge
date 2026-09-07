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
});

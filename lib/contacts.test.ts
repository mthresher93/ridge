import { describe, expect, it } from "vitest";
import { findDuplicateLeads } from "./contacts";
import { blankProspect } from "./freight";

describe("findDuplicateLeads", () => {
  it("matches normalized phone numbers", () => {
    const existing = [blankProspect("Michael", { id: "b", phone: "(312) 555-0140", name: "Mike" })];
    const hits = findDuplicateLeads(existing, { id: "a", phone: "312-555-0140", email: "" });
    expect(hits.map((item) => item.id)).toContain("b");
  });

  it("ignores archived records", () => {
    const existing = [blankProspect("Michael", { id: "b", phone: "3125550140", archivedAt: "2026-01-01T00:00:00.000Z" })];
    const hits = findDuplicateLeads(existing, { id: "a", phone: "3125550140", email: "" });
    expect(hits).toHaveLength(0);
  });
});

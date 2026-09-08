import { describe, expect, it } from "vitest";
import { blankProspect } from "./freight";
import { firstCall, openerForLead, yardRole } from "./prospect";

describe("firstCall", () => {
  it("tells you who to ask and gives a short opener for a dealer yard", () => {
    const lead = blankProspect("Michael", {
      id: "lead-1",
      name: "HOLT CAT Tyler",
      label: "Dealer",
      equipmentType: "forklift",
      freightScore: 100,
    });
    const call = firstCall(lead, 0);
    expect(yardRole(lead)).toBe("Yard");
    expect(call.ask).toMatch(/outbound freight/i);
    expect(firstCall(blankProspect("Michael", { name: "Briggs Equipment — Dallas" })).ask).toMatch(/outbound freight/i);
    expect(call.opener.length).toBeGreaterThan(20);
    expect(openerForLead(lead)).toMatch(/forklift|outbound|pickup|shipping/i);
  });
});

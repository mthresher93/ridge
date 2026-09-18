import { describe, expect, it } from "vitest";
import { blankProspect } from "./freight";
import { emptyWorkspace } from "./seed";
import { crmStageOf, dealHealth, moveLeadToCrmStage } from "./crm-pipeline";

function desk() {
  const workspace = emptyWorkspace();
  workspace.leads = [
    blankProspect("Michael", { id: "lead-1", name: "Holt CAT", city: "Dallas", state: "TX", phone: "214-342-6700", status: "Discovered" }),
  ];
  return workspace;
}

describe("crm pipeline", () => {
  it("maps discovered yards to New", () => {
    expect(crmStageOf(desk().leads[0])).toBe("new");
  });

  it("moves a card to Proposal and writes the quote status", () => {
    const next = moveLeadToCrmStage(desk(), "lead-1", "proposal", "2026-09-18T00:00:00.000Z");
    expect(next.leads[0].status).toBe("Quote Requested");
    expect(crmStageOf(next.leads[0], next)).toBe("proposal");
    expect(next.opportunities[0]?.stage).toBe("proposal");
    expect(next.opportunities[0]?.probability).toBe(60);
  });

  it("grades a dead line as F", () => {
    const lead = blankProspect("Michael", { name: "X", dnc: true, freightScore: 90 });
    expect(dealHealth(lead).grade).toBe("F");
  });
});

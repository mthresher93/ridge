import { describe, expect, it } from "vitest";
import { blankProspect } from "../freight";
import { emptyWorkspace } from "../seed";
import { moveLeadToCrmStage } from "../crm-pipeline";
import { dealsOnBoard } from "../crm-pipeline";
import { filterDeals, nextStageId, openPipeline, weightedPipeline, wonRevenue } from "./pipeline";

function desk() {
  const workspace = emptyWorkspace();
  workspace.leads = [
    blankProspect("Michael", {
      id: "lead-open",
      name: "Holt CAT",
      city: "Dallas",
      state: "TX",
      phone: "214-342-6700",
      status: "Qualified",
      estimatedValue: 1000,
      owner: "Michael",
      label: "Dealer",
    }),
    blankProspect("Michael", {
      id: "lead-won",
      name: "Doggett",
      city: "Houston",
      state: "TX",
      phone: "713-675-7000",
      status: "Load Won",
      estimatedValue: 500,
      owner: "Michael",
      label: "Dealer",
    }),
    blankProspect("Michael", {
      id: "lead-lost",
      name: "Lost Yard",
      city: "Waco",
      state: "TX",
      phone: "254-261-1370",
      status: "Load Lost",
      estimatedValue: 800,
      owner: "Michael",
    }),
  ];
  return workspace;
}

describe("pipeline selectors", () => {
  it("excludes won and lost from open pipeline", () => {
    const deals = dealsOnBoard(desk());
    expect(openPipeline(deals)).toBe(1000);
    expect(weightedPipeline(deals)).toBe(250);
  });

  it("counts won revenue separately", () => {
    const workspace = desk();
    const stamped = moveLeadToCrmStage(workspace, "lead-won", "won", new Date().toISOString());
    const deals = dealsOnBoard(stamped);
    expect(wonRevenue(deals, stamped)).toBe(500);
  });

  it("does not advance won into lost", () => {
    expect(nextStageId("negotiation")).toBe("won");
    expect(nextStageId("won")).toBeNull();
    expect(nextStageId("lost")).toBeNull();
  });

  it("filters yards pipeline", () => {
    const rows = filterDeals(desk(), { kind: "yards" });
    expect(rows.every((row) => row.lead.label === "Dealer")).toBe(true);
  });
});

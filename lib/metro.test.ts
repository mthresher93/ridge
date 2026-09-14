import { describe, expect, it } from "vitest";
import { blankProspect } from "./freight";
import { callableUncontacted, densestHuntPlace, leadsInPlace, metroOf, prospectRank, workQueue } from "./metro";
import { emptyWorkspace } from "./seed";

describe("metroOf", () => {
  it("clusters Texas yards by city, including names that carry the city", () => {
    expect(metroOf({ city: "Dallas", state: "TX" })?.id).toBe("dallas");
    expect(metroOf({ city: "Fort Worth", state: "TX" })?.id).toBe("fortworth");
    expect(metroOf({ name: "Briggs Equipment — Houston", city: "Houston" })?.id).toBe("houston");
    expect(metroOf({ city: "Hewitt", state: "TX" })?.id).toBe("waco");
  });
});

describe("prospectRank", () => {
  it("puts an untried callable yard ahead of a tried high-score listing", () => {
    const untried = blankProspect("Michael", {
      name: "Briggs Equipment — Dallas",
      phone: "214-351-4511",
      status: "Discovered",
      freightScore: 70,
      attempts: 0,
    });
    const tried = blankProspect("Michael", {
      name: "Tried yard",
      phone: "713-675-7000",
      status: "Discovered",
      freightScore: 100,
      attempts: 3,
    });
    expect(prospectRank(untried)).toBeGreaterThan(prospectRank(tried));
  });
});

describe("workQueue", () => {
  it("does not bury never-called yards behind contacted high scores", () => {
    const leads = [
      blankProspect("Michael", { id: "a", name: "Contacted dealer", phone: "214-351-4511", status: "Contacted", freightScore: 100, attempts: 1 }),
      blankProspect("Michael", { id: "b", name: "Briggs Equipment — Houston", phone: "713-672-1100", status: "Discovered", freightScore: 80, attempts: 0 }),
    ];
    expect(workQueue(leads)[0].id).toBe("b");
  });
});

describe("huntPlacesFromBook", () => {
  it("points hunt at the metro with the most uncalled phones", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [
      blankProspect("Michael", { name: "Dallas yard", phone: "214-351-4511", city: "Dallas", state: "TX", status: "Discovered" }),
      blankProspect("Michael", { name: "Dallas two", phone: "214-371-7777", city: "Dallas", state: "TX", status: "Discovered" }),
      blankProspect("Michael", { name: "Houston yard", phone: "713-672-1100", city: "Houston", state: "TX", status: "Discovered" }),
    ];
    expect(densestHuntPlace(workspace)).toBe("Dallas TX");
    expect(leadsInPlace(workspace.leads, "Houston TX")).toHaveLength(1);
    expect(callableUncontacted(workspace, 10)).toHaveLength(3);
  });
});

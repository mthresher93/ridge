import { describe, expect, it } from "vitest";
import { topMove } from "./derive";
import { blankProspect } from "./freight";
import { emptyWorkspace } from "./seed";

describe("topMove", () => {
  it("sends an empty workspace to Discover", () => {
    const move = topMove(emptyWorkspace());
    expect(move.href).toBe("/discover");
    expect(move.cta).toMatch(/Discover/i);
  });

  it("asks you to label an unlabeled client before outreach", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [blankProspect("Michael", { id: "lead-1", name: "Hill Yard", status: "Discovered" })];
    const move = topMove(workspace);
    expect(move.kicker).toMatch(/Label/i);
    expect(move.href).toContain("/people?id=lead-1");
  });

  it("opens outreach once the client is labeled", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [blankProspect("Michael", { id: "lead-1", name: "Hill Yard", status: "Discovered", label: "Dealer" })];
    const move = topMove(workspace);
    expect(move.href).toBe("/outreach");
  });
});

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

  it("puts a published yard phone ahead of an unlabeled client without a number", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [
      blankProspect("Michael", { id: "lead-1", name: "No phone yard", status: "Discovered" }),
      blankProspect("Michael", {
        id: "lead-2",
        name: "HOLT CAT Dallas (North)",
        phone: "214-342-6700",
        status: "Discovered",
        label: "Dealer",
      }),
    ];
    const move = topMove(workspace);
    expect(move.title).toBe("HOLT CAT Dallas (North)");
    expect(move.kicker).toMatch(/Call/i);
  });

  it("sends an unlabeled client without a phone to the work screen", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [blankProspect("Michael", { id: "lead-1", name: "Hill Yard", status: "Discovered" })];
    const move = topMove(workspace);
    expect(move.kicker).toMatch(/Work/i);
    expect(move.href).toBe("/outreach?id=lead-1");
  });

  it("opens the work screen once the client is labeled and has no published phone", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [blankProspect("Michael", { id: "lead-1", name: "Hill Yard", status: "Discovered", label: "Dealer" })];
    const move = topMove(workspace);
    expect(move.href).toBe("/outreach?id=lead-1");
  });
});

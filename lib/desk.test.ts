import { describe, expect, it } from "vitest";
import { deskPlan, todayHunt } from "./desk";
import { blankProspect } from "./freight";
import { emptyWorkspace } from "./seed";
import { HUNT_PLAYS } from "./hunt";

describe("todayHunt", () => {
  it("returns a real play with public URLs", () => {
    const hunt = todayHunt(new Date("2026-09-07T12:00:00"));
    expect(hunt.weekday).toBe("Monday");
    expect(hunt.play.id).toBe("yards");
    expect(hunt.links.length).toBeGreaterThan(0);
    expect(hunt.links[0].url).toMatch(/^https:\/\//);
    expect(hunt.href).toContain("play=yards");
    expect(hunt.href).toContain("q=forklift");
    expect(HUNT_PLAYS.some((play) => play.id === hunt.play.id)).toBe(true);
  });
});

describe("deskPlan", () => {
  it("sends an empty file to today's hunt, Intel, and paste", () => {
    const plan = deskPlan(emptyWorkspace(), Date.parse("2026-09-07T12:00:00"));
    expect(plan).toHaveLength(3);
    expect(plan[0].href).toContain("/discover");
    expect(plan[1].href).toBe("/playbook");
    expect(plan[2].href).toContain("paste");
  });

  it("sends an unlabeled capture to the work screen, not Clients", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [blankProspect("Michael", { id: "lead-1", name: "Westside Machinery LLC", status: "Discovered" })];
    const plan = deskPlan(workspace, Date.parse("2026-09-07T12:00:00"));
    expect(plan[0].href).toBe("/outreach?id=lead-1");
    expect(plan.some((item) => item.href.startsWith("/people"))).toBe(false);
  });

  it("puts a published yard phone first so the desk is a call list, not a hunt tutorial", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [
      blankProspect("Michael", {
        id: "lead-1",
        name: "HOLT CAT Dallas (North)",
        phone: "214-342-6700",
        status: "Discovered",
        label: "Dealer",
        freightScore: 100,
      }),
    ];
    const plan = deskPlan(workspace, Date.parse("2026-09-08T12:00:00"));
    expect(plan[0].title).toBe("HOLT CAT Dallas (North)");
    expect(plan[0].kicker).toMatch(/Call/i);
    expect(plan[0].why).toMatch(/214-342-6700/);
  });
});

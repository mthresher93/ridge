import { describe, expect, it } from "vitest";
import { deskPlan, todayHunt } from "./desk";
import { emptyWorkspace } from "./seed";
import { HUNT_PLAYS } from "./hunt";

describe("todayHunt", () => {
  it("returns a real play with public URLs", () => {
    const hunt = todayHunt(new Date("2026-09-07T12:00:00"));
    expect(hunt.weekday).toBe("Monday");
    expect(hunt.play.id).toBe("yards");
    expect(hunt.links.length).toBeGreaterThan(0);
    expect(hunt.links[0].url).toMatch(/^https:\/\//);
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
});

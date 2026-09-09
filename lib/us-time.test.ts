import { describe, expect, it } from "vitest";
import { deskClocks, inCallingWindow, localClock, zoneForState } from "./us-time";

describe("zoneForState", () => {
  it("maps Texas to Chicago", () => {
    expect(zoneForState("TX")).toBe("America/Chicago");
    expect(zoneForState("tx")).toBe("America/Chicago");
  });
});

describe("inCallingWindow", () => {
  it("flags a Pacific contact at 4am local", () => {
    const now = new Date("2026-09-09T11:00:00.000Z");
    const clock = localClock("CA", now);
    expect(clock.minutes).toBe(4 * 60);
    const window = inCallingWindow("CA", "06:30", "20:00", now);
    expect(window.ok).toBe(false);
  });

  it("allows a Texas contact at 10:00 local", () => {
    const now = new Date("2026-09-09T15:00:00.000Z");
    const window = inCallingWindow("TX", "06:30", "20:00", now);
    expect(window.ok).toBe(true);
  });
});

describe("deskClocks", () => {
  it("shows Phnom Penh and US Central from the same instant", () => {
    const clocks = deskClocks(new Date("2026-09-09T15:00:00.000Z"));
    expect(clocks.broker.zone).toBe("Asia/Phnom_Penh");
    expect(clocks.book.zone).toBe("America/Chicago");
    expect(clocks.broker.clock).toMatch(/Sep/);
    expect(clocks.book.clock).toMatch(/Sep/);
  });
});

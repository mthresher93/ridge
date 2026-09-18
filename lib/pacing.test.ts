import { describe, expect, it } from "vitest";
import { messagesSentOnDay, pacingNote, variantIndex } from "./pacing";

describe("pacing", () => {
  it("counts message_sent on the same calendar day", () => {
    const now = Date.parse("2026-09-07T12:00:00");
    const events = [
      { id: "1", type: "message_sent", at: "2026-09-07T08:00:00.000Z" },
      { id: "2", type: "message_sent", at: "2026-09-06T08:00:00.000Z" },
      { id: "3", type: "dial_attempt", at: "2026-09-07T09:00:00.000Z" },
    ];
    expect(messagesSentOnDay(events, now)).toBe(1);
  });

  it("warns after the soft cap", () => {
    expect(pacingNote(12).level).toBe("ok");
    expect(pacingNote(25).level).toBe("caution");
    expect(pacingNote(40).level).toBe("stop");
  });

  it("changes variant with seed and send count", () => {
    expect(variantIndex("lead-a", 0, 3)).not.toBe(variantIndex("lead-a", 1, 3));
  });
});

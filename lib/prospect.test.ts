import { describe, expect, it } from "vitest";
import { blankProspect } from "./freight";
import { emptyWorkspace } from "./seed";
import { firstCall, labelObviousYards, openerForLead, recordCallAttempt, wrapCall, yardRole } from "./prospect";

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

describe("recordCallAttempt", () => {
  it("saves the booker on talked and does not log a sent message", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [blankProspect("Michael", { id: "lead-1", name: "Briggs Equipment — Dallas", phone: "214-351-4511", status: "Discovered" })];
    const next = recordCallAttempt(workspace, "lead-1", "talked", "2026-09-08T12:00:00.000Z", { booker: "Maria", bookerPhone: "214-351-4511" });
    expect(next.leads[0].booker).toBe("Maria");
    expect(next.leads[0].status).toBe("Contacted");
    expect(next.kpiEvents).toEqual(workspace.kpiEvents);
  });

  it("creates a follow-up callback after voicemail", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [blankProspect("Michael", { id: "lead-1", name: "Briggs Equipment — Dallas", phone: "214-351-4511", status: "Discovered" })];
    const next = recordCallAttempt(workspace, "lead-1", "voicemail", "2026-09-08T12:00:00.000Z");
    expect(next.callbacks[0].reason).toMatch(/voicemail/i);
    expect(next.leads[0].status).toBe("Discovered");
    expect(next.callLogs[0].outcome).toBe("voicemail");
  });
});

describe("wrapCall", () => {
  it("writes an activity and a dial event that survive on the workspace", () => {
    const workspace = emptyWorkspace();
    workspace.leads = [blankProspect("Michael", { id: "lead-1", name: "Briggs Equipment — Dallas", phone: "214-351-4511" })];
    const next = wrapCall(workspace, "lead-1", "talked", { notes: "Maria books freight", booker: "Maria" });
    expect(next.activities[0].type).toBe("call");
    expect(next.activities[0].detail).toMatch(/talked/i);
    expect(next.kpiEvents.some((event) => event.type === "dial_attempt")).toBe(true);
    expect(next.kpiEvents.some((event) => event.type === "connected_call")).toBe(true);
  });
});

describe("labelObviousYards", () => {
  it("labels Briggs and Toyota Lift as Dealer without touching Jane", () => {
    const leads = [
      blankProspect("Michael", { id: "a", name: "Briggs Equipment — Dallas" }),
      blankProspect("Michael", { id: "b", name: "Jane", listingTitle: "Toyota forklift" }),
    ];
    const next = labelObviousYards(leads, "2026-09-08T12:00:00.000Z");
    expect(next[0].label).toBe("Dealer");
    expect(next[1].label).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { blankProspect, finishConnectedCall } from "./freight";
import { wrapCall } from "./prospect";
import { bookerOf, contactsForLead, skipQuote, unfinishedTalked, upsertBooker } from "./people";
import { emptyWorkspace } from "./seed";

describe("booker contacts", () => {
  it("saves the booker as a contact on the yard, not as a second client", () => {
    const lead = blankProspect("Michael", { id: "lead-1", name: "HOLT CAT Dallas (North)", city: "Dallas", state: "TX" });
    const workspace = { ...emptyWorkspace(), leads: [lead] };
    const next = upsertBooker(workspace, "lead-1", { name: "Maria", phone: "214-555-0100" });
    expect(next.created).toBe(true);
    expect(next.workspace.leads).toHaveLength(1);
    expect(next.workspace.leads[0].name).toBe("HOLT CAT Dallas (North)");
    expect(next.workspace.leads[0].booker).toBe("Maria");
    expect(contactsForLead(next.workspace, "lead-1")).toHaveLength(1);
    expect(bookerOf(next.workspace, next.workspace.leads[0])?.name).toBe("Maria");
    const again = upsertBooker(next.workspace, "lead-1", { name: "Maria", phone: "214-555-0100" });
    expect(again.created).toBe(false);
    expect(contactsForLead(again.workspace, "lead-1")).toHaveLength(1);
  });

  it("writes a contact when a connected call names the booker", () => {
    const lead = blankProspect("Michael", { id: "lead-1", name: "HOLT CAT Dallas (North)", phone: "214-342-6700" });
    const workspace = { ...emptyWorkspace(), leads: [lead] };
    const next = wrapCall(workspace, "lead-1", "talked", { booker: "Maria", bookerPhone: "214-351-4511" });
    expect(bookerOf(next, next.leads[0])?.name).toBe("Maria");
    expect(bookerOf(next, next.leads[0])?.role).toBe("Books freight");
    expect(unfinishedTalked(next)?.leadId).toBe("lead-1");
  });

  it("keeps the wrap open until a blank quote exists", () => {
    const lead = blankProspect("Michael", { id: "lead-1", name: "HOLT CAT Dallas (North)" });
    let workspace = wrapCall({ ...emptyWorkspace(), leads: [lead] }, "lead-1", "talked", { booker: "Maria" });
    expect(unfinishedTalked(workspace)?.leadId).toBe("lead-1");
    const quoted = finishConnectedCall(workspace, "lead-1", { booker: "Maria", destination: "Austin, TX" });
    expect(quoted.ok).toBe(true);
    if (!quoted.ok) return;
    expect(unfinishedTalked(quoted.workspace)).toBeNull();
    expect(quoted.workspace.contacts[0].name).toBe("Maria");
  });

  it("does not keep wrap open on an archived yard", () => {
    const lead = blankProspect("Michael", {
      id: "lead-1",
      name: "Westside Machinery LLC",
      phone: "214-351-4511",
      archivedAt: "2026-09-08T17:32:57.209Z",
    });
    const workspace = wrapCall({ ...emptyWorkspace(), leads: [lead] }, "lead-1", "talked", { booker: "Maria" });
    expect(unfinishedTalked(workspace)).toBeNull();
  });

  it("turns a skipped quote into a follow-up instead of losing the yard", () => {
    const lead = blankProspect("Michael", { id: "lead-1", name: "HOLT CAT Dallas (North)" });
    const workspace = wrapCall({ ...emptyWorkspace(), leads: [lead] }, "lead-1", "talked", { booker: "Maria" });
    const skipped = skipQuote(workspace, "lead-1");
    expect(unfinishedTalked(skipped)).toBeNull();
    expect(skipped.callbacks[0].type).toBe("standard");
    expect(skipped.callbacks[0].reason).toMatch(/blank quote/i);
  });
});

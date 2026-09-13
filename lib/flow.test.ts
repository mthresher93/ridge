import { describe, expect, it } from "vitest";
import { blankProspect } from "./freight";
import { deskFlow, flowAreaPath, flowCurvePath, flowGraphPoints, flowSegmentPath } from "./flow";
import { wrapCall } from "./prospect";
import { emptyWorkspace } from "./seed";

const hunt = { href: "/discover", place: "Dallas TX", query: "forklift" };

describe("deskFlow", () => {
  it("starts on Hunt when the floor is empty", () => {
    const flow = deskFlow(emptyWorkspace(), hunt);
    expect(flow.current).toBe("hunt");
    expect(flow.steps).toHaveLength(7);
    const points = flowGraphPoints(flow.steps);
    expect(points).toHaveLength(7);
    expect(flowCurvePath(points)).toMatch(/^M /);
    expect(flowAreaPath(points)).toMatch(/Z$/);
    expect(flowSegmentPath(points, 0)).toMatch(/^M /);
  });

  it("lights Wrap after a connected call with no quote", () => {
    const lead = blankProspect("Michael", { id: "lead-1", name: "HOLT CAT Dallas (North)", phone: "214-342-6700" });
    const workspace = wrapCall({ ...emptyWorkspace(), leads: [lead] }, "lead-1", "talked", { booker: "Maria" });
    const flow = deskFlow(workspace, hunt);
    expect(flow.current).toBe("wrap");
    expect(flow.line).toMatch(/HOLT CAT/);
    expect(flow.edges.find((item) => item.to === "wrap")?.tone).toBe("hot");
  });

  it("lights Call when untried phones are on the book", () => {
    const lead = blankProspect("Michael", {
      id: "lead-1",
      name: "Briggs Equipment — Dallas",
      phone: "214-351-4511",
      status: "Discovered",
      label: "Dealer",
    });
    const flow = deskFlow({ ...emptyWorkspace(), leads: [lead] }, hunt);
    expect(flow.current).toBe("call");
    expect(flow.steps.find((item) => item.id === "call")?.count).toBe(1);
    expect(flow.edges.every((item) => item.tone === "ok")).toBe(true);
  });

  it("plots captured listings and ignores archived follow-ups", () => {
    const live = blankProspect("Michael", {
      id: "lead-1",
      name: "Briggs Equipment — Dallas",
      phone: "214-351-4511",
      status: "Discovered",
      label: "Dealer",
    });
    const dead = blankProspect("Michael", {
      id: "lead-2",
      name: "Westside Machinery LLC",
      status: "Contacted",
      archivedAt: "2026-09-08T17:32:57.209Z",
    });
    const flow = deskFlow(
      {
        ...emptyWorkspace(),
        leads: [live, dead],
        listings: [
          {
            id: "list-1",
            leadId: "lead-1",
            source: "Google",
            sourceUrl: "https://example.com",
            title: "Briggs",
            description: "",
            sellerName: "Briggs",
            sellerUrl: "",
            city: "Dallas",
            state: "TX",
            askingPrice: null,
            category: "",
            equipmentType: "",
            dimensions: "",
            weight: "",
            quantity: null,
            pickupLocation: "",
            destination: "",
            phone: "214-351-4511",
            email: "",
            website: "",
            notes: "",
            imageUrls: [],
            discoveredAt: "2026-09-07T00:00:00.000Z",
            priceHistory: [],
          },
        ],
        callbacks: [
          {
            id: "cb-1",
            leadId: "lead-2",
            type: "standard",
            dueAt: "2020-01-01T00:00:00.000Z",
            reason: "No reply after first message.",
            assignedUser: "Michael",
            notes: "",
            status: "open",
            createdAt: "2020-01-01T00:00:00.000Z",
          },
        ],
      },
      hunt,
    );
    expect(flow.steps.find((item) => item.id === "hunt")?.count).toBe(1);
    expect(flow.steps.find((item) => item.id === "call")?.count).toBe(1);
    expect(flow.steps.find((item) => item.id === "call")?.hot).toBeFalsy();
    expect(flow.steps.find((item) => item.id === "call")?.hint).toMatch(/published phone/);
    expect(flow.steps.find((item) => item.id === "call")?.hint).not.toMatch(/Dallas TX|Laredo/);
  });

  it("draws a green graph and a red hop into Wrap when a call is unfinished", () => {
    const lead = blankProspect("Michael", {
      id: "lead-1",
      name: "HOLT CAT Dallas (North)",
      phone: "214-342-6700",
      label: "Dealer",
    });
    const workspace = wrapCall({ ...emptyWorkspace(), leads: [lead] }, "lead-1", "talked", { booker: "Maria" });
    const flow = deskFlow(workspace, hunt);
    expect(flow.edges.find((item) => item.from === "hunt" && item.to === "paste")?.tone).toBe("ok");
    expect(flow.edges.find((item) => item.from === "call" && item.to === "wrap")?.tone).toBe("hot");
    expect(flow.edges.filter((item) => item.tone === "ok").length).toBeGreaterThanOrEqual(4);
  });
});

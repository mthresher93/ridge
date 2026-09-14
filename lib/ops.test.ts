import { describe, expect, it } from "vitest";
import { blankProspect } from "./freight";
import { convertQuoteToLoad, deskAttention, recordTracking, setVetCheck } from "./ops";
import { emptyWorkspace } from "./seed";
import { createSimulatedTelephony } from "./telephony";

describe("convertQuoteToLoad", () => {
  it("turns a quote into a numbered load and keeps it after a second pass", () => {
    const stamp = "2026-09-08T12:00:00.000Z";
    const lead = { ...blankProspect("Michael"), id: "ld1", name: "Gulf Coast Iron" };
    let workspace = emptyWorkspace();
    workspace = {
      ...workspace,
      leads: [lead],
      shipments: [
        {
          id: "shp1",
          leadId: lead.id,
          customer: "Gulf Coast Iron",
          contact: "Pat",
          origin: "Houston, TX",
          destination: "Dallas, TX",
          pickupDate: "",
          deliveryDate: "",
          commodity: "excavator",
          weight: "28000",
          dimensions: "22 x 8.5 x 10.5",
          equipmentType: "RGN",
          carrier: "",
          carrierRate: 0,
          customerRate: 4200,
          status: "Quote",
          reference: "",
          notes: "",
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
    };
    const first = convertQuoteToLoad(workspace, "shp1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.shipment.status).toBe("Carrier Needed");
    expect(first.shipment.loadNumber).toMatch(/^HAUL-/);
    const again = convertQuoteToLoad(first.workspace, "shp1");
    expect(again.ok).toBe(false);
    const tracked = recordTracking(first.workspace, "shp1", "Delivered");
    expect(tracked.ok).toBe(true);
    if (!tracked.ok) return;
    const pod = recordTracking(tracked.workspace, "shp1", "POD received");
    expect(pod.ok).toBe(true);
    if (!pod.ok) return;
    expect(pod.shipment.podReceived).toBe(true);
    expect(pod.workspace.kpiEvents.some((event) => event.type === "load_booked")).toBe(true);
  });
});

describe("deskAttention", () => {
  it("explains overdue callbacks and uncovered loads", () => {
    const stamp = new Date().toISOString();
    const due = new Date(Date.now() - 47 * 60 * 1000).toISOString();
    const lead = { ...blankProspect("Michael"), id: "ld1", name: "Gulf Coast Iron" };
    const workspace = {
      ...emptyWorkspace(),
      leads: [lead],
      callbacks: [{ id: "cb1", leadId: lead.id, type: "standard" as const, reason: "Quote follow-up", notes: "", dueAt: due, status: "open" as const, createdAt: stamp, assignedUser: "Michael" }],
      shipments: [
        {
          id: "shp1",
          leadId: lead.id,
          customer: "Gulf Coast Iron",
          contact: "",
          origin: "Houston, TX",
          destination: "Dallas, TX",
          pickupDate: "",
          deliveryDate: "",
          commodity: "excavator",
          weight: "",
          dimensions: "",
          equipmentType: "",
          carrier: "",
          carrierRate: 0,
          customerRate: 4200,
          status: "Quote" as const,
          reference: "",
          notes: "",
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
    };
    const items = deskAttention(workspace);
    expect(items.some((item) => item.why.includes("Callback due"))).toBe(true);
    expect(items.some((item) => item.why === "Quote awaiting response")).toBe(true);
  });
});

describe("setVetCheck", () => {
  it("does not treat a carrier as verified just because the file exists", () => {
    const workspace = emptyWorkspace();
    const withCarrier = {
      ...workspace,
      carriers: [
        {
          id: "cr1",
          name: "Desert Hotshot LLC",
          mc: "123456",
          dot: "987654",
          phone: "2143514511",
          email: "",
          city: "",
          state: "",
          equipment: "hotshot",
          sourceUrl: "",
          notes: "",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    const next = setVetCheck(withCarrier, "cr1", "mc", "pass");
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.carrier.vetting.find((item) => item.id === "mc")?.state).toBe("pass");
    expect(next.carrier.vetting.find((item) => item.id === "insurance")?.state).toBe("unchecked");
  });
});

describe("telephony", () => {
  it("keeps simulation out of a one-way tel start", () => {
    const tel = createSimulatedTelephony();
    expect(tel.getCallState().state).toBe("idle");
    tel.startCall("2143514511");
    expect(tel.getCallState().state).toBe("active");
    tel.mute();
    expect(tel.getCallState().muted).toBe(true);
    tel.endCall();
    expect(tel.getCallState().state).toBe("ended");
  });
});

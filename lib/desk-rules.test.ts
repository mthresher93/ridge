import { describe, expect, it } from "vitest";
import { blankProspect } from "./freight";
import {
  captureScore,
  carrierSaveError,
  clientSaveError,
  followUpSaveError,
  isDemoCarrier,
  isDemoLead,
  isDemoShipment,
  purgeWorkspace,
  yardOpener,
} from "./desk-rules";
import { emptyWorkspace } from "./seed";

describe("desk-rules", () => {
  it("refuses clients without a published Texas phone", () => {
    expect(clientSaveError({ name: "Holt CAT", city: "Dallas", state: "TX", phone: "214-555-0100" })).toMatch(/phone/i);
    expect(clientSaveError({ name: "Holt CAT", city: "Chicago", state: "IL", phone: "214-351-4511" })).toMatch(/Texas/i);
    expect(clientSaveError({ name: "Holt CAT", city: "Dallas", state: "TX", phone: "214-351-4511" })).toBeNull();
  });

  it("refuses carriers missing MC, DOT, or dispatch phone", () => {
    expect(carrierSaveError({ name: "Acme", mc: "123456", dot: "", phone: "432-758-4410" })).toMatch(/DOT/i);
    expect(carrierSaveError({ name: "Acme", mc: "123456", dot: "987654", phone: "432-758-4410" })).toBeNull();
  });

  it("refuses follow-ups without a named human", () => {
    expect(followUpSaveError({ personName: "", reason: "Check Monday" })).toMatch(/named/i);
    expect(followUpSaveError({ personName: "Maria", reason: "Asked me to check Monday" })).toBeNull();
  });

  it("scores a yard paste from phone + address + name", () => {
    expect(captureScore({ phone: "214-351-4511", city: "Dallas", state: "TX", name: "Briggs Equipment", address: "123 Industrial" })).toBeGreaterThanOrEqual(75);
    expect(captureScore({ phone: "", name: "A blog about forklifts" })).toBeLessThan(50);
  });

  it("purges demo trucks, dummy loads, and 555 yards", () => {
    const workspace = purgeWorkspace({
      ...emptyWorkspace(),
      leads: [
        blankProspect("Michael", { id: "good", name: "Texas First Rentals Lewisville", city: "Lewisville", state: "TX", phone: "214-501-0580" }),
        blankProspect("Michael", { id: "fake", name: "Westside Machinery LLC", phone: "214-555-0100", listingUrl: "https://example.com/x" }),
      ],
      carriers: [{ id: "cr-1", name: "Desert Hotshot LLC", mc: "123456", dot: "987654", phone: "(432) 758-4410", email: "", city: "", state: "", equipment: "", sourceUrl: "", notes: "", createdAt: "" }],
      shipments: [{ id: "sh-1", leadId: "good", customer: "Persistence check", contact: "", origin: "Houston, TX", destination: "Dallas, TX", pickupDate: "", deliveryDate: "", commodity: "", weight: "", dimensions: "", equipmentType: "", carrier: "Desert Hotshot LLC", carrierRate: 0, customerRate: 0, status: "Delivered", reference: "", notes: "", createdAt: "", updatedAt: "" }],
    });
    expect(workspace.leads.map((item) => item.id)).toEqual(["good"]);
    expect(workspace.carriers).toHaveLength(0);
    expect(workspace.shipments).toHaveLength(0);
    expect(isDemoLead(blankProspect("Michael", { name: "Westside Machinery LLC", phone: "214-555-0100" }))).toBe(true);
    expect(isDemoCarrier({ id: "x", name: "Desert Hotshot LLC", mc: "123456", dot: "987654", phone: "", email: "", city: "", state: "", equipment: "", sourceUrl: "", notes: "", createdAt: "" })).toBe(true);
    expect(isDemoShipment({ id: "x", leadId: "", customer: "Persistence check", contact: "", origin: "", destination: "", pickupDate: "", deliveryDate: "", commodity: "", weight: "", dimensions: "", equipmentType: "", carrier: "", carrierRate: 0, customerRate: 0, status: "Quote", reference: "", notes: "", createdAt: "", updatedAt: "" })).toBe(true);
  });

  it("writes the yard opener with city and address", () => {
    const lead = blankProspect("Michael", { name: "Holt CAT", city: "Dallas", state: "TX", address: "10580 Spangler Rd" });
    expect(yardOpener(lead)).toMatch(/Dallas — Michael/);
    expect(yardOpener(lead)).toMatch(/Who books the truck/);
  });
});

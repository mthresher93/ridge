import { describe, expect, it } from "vitest";
import { blankProspect } from "./freight";
import { deskFlow } from "./flow";
import { wrapCall } from "./prospect";
import { emptyWorkspace } from "./seed";

const hunt = { href: "/discover", place: "Dallas TX", query: "forklift" };

describe("deskFlow", () => {
  it("starts on Hunt when the floor is empty", () => {
    const flow = deskFlow(emptyWorkspace(), hunt);
    expect(flow.current).toBe("hunt");
    expect(flow.steps).toHaveLength(7);
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
  });
});

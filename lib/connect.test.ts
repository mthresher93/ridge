import { describe, expect, it } from "vitest";
import { allowedCompanyApiUrl, jsonRecords, previewCompanyFeed, recordToCapture } from "./connect";

describe("allowedCompanyApiUrl", () => {
  it("accepts a public https JSON endpoint", () => {
    expect(allowedCompanyApiUrl("https://desk.example.com/api/locations").ok).toBe(true);
  });

  it("rejects a scrape-looking non-http URL", () => {
    expect(allowedCompanyApiUrl("ftp://example.com/files").ok).toBe(false);
  });
});

describe("jsonRecords", () => {
  it("reads a bare array of yards", () => {
    const rows = jsonRecords([
      { name: "Toyota Lift of Houston", phone: "713-675-7000", city: "Houston", state: "TX" },
    ]);
    expect(rows).toHaveLength(1);
  });

  it("reads { data: [] } from a typical free REST API", () => {
    const rows = jsonRecords({ data: [{ company: "Kirby-Smith", telephone: "214-445-0000" }] });
    expect(rows[0].company).toBe("Kirby-Smith");
  });
});

describe("recordToCapture", () => {
  it("maps a dealer location without inventing a phone", () => {
    const payload = recordToCapture(
      { company: "Mustang Cat", city: "Houston", website: "https://mustangcat.com" },
      "https://desk.example.com/api/locations",
    );
    expect(payload?.sellerName).toBe("Mustang Cat");
    expect(payload?.phone).toBe("");
    expect(payload?.source).toBe("Company API");
  });

  it("skips nested company objects and uses the string name", () => {
    const payload = recordToCapture(
      { company: { name: "Romaguera" }, name: "Leanne Graham", phone: "713-675-7000" },
      "https://example.com/api/users",
    );
    expect(payload?.sellerName).toBe("Leanne Graham");
  });

  it("does not treat an empty object as a client", () => {
    expect(recordToCapture({ id: 3 }, "https://example.com/api")).toBeNull();
  });
});

describe("previewCompanyFeed", () => {
  it("counts usable rows from a wrapped payload", () => {
    const preview = previewCompanyFeed(
      { results: [{ name: "Briggs Equipment", phone: "713-672-1100", city: "Houston" }] },
      "https://example.com/api/dealers",
    );
    expect(preview.usable).toBe(1);
    expect(preview.sampleName).toBe("Briggs Equipment");
  });
});

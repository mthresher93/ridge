import { describe, expect, it } from "vitest";
import { bboxAround, bboxForPlace, finderSearchTerms, mergeFinderHits, overpassQuery, parseFinderElements, parseNominatimHits, parsePhotonHits } from "./finder";

describe("bboxForPlace", () => {
  it("uses the Texas metro boxes so Nominatim is not required", () => {
    const dallas = bboxForPlace("Dallas TX");
    expect(dallas?.south).toBeLessThan(dallas?.north || 0);
    expect(bboxForPlace("Houston TX")?.west).toBeLessThan(-94);
  });
});

describe("parseFinderElements", () => {
  it("keeps a published OSM phone and skips unnamed nodes", () => {
    const hits = parseFinderElements(
      [
        {
          type: "node",
          id: 1,
          lat: 32.78,
          lon: -96.8,
          tags: { name: "Dallas Forklift Co", phone: "2143514511", "addr:city": "Dallas", "addr:state": "TX", shop: "trade" },
        },
        { type: "node", id: 2, lat: 32.78, lon: -96.8, tags: { amenity: "fuel" } },
      ],
      "forklift",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].phone).toBe("2143514511");
    expect(hits[0].osmUrl).toContain("node/1");
  });
});

describe("overpassQuery", () => {
  it("stays inside a bbox and does not invent a phone filter", () => {
    const q = overpassQuery("forklift", bboxAround(32.78, -96.8, 10));
    expect(q).toContain("forklift");
    expect(q).toContain("timeout:15");
    expect(q).toContain("tool_hire");
    expect(q).not.toContain("phone=");
  });
});

describe("finderSearchTerms", () => {
  it("adds rental and dealer variants so one hunt covers more yards", () => {
    expect(finderSearchTerms("forklift", "Dallas TX")).toEqual(["forklift Dallas TX", "equipment rental Dallas TX", "machinery dealer Dallas TX"]);
  });
});

describe("parseNominatimHits", () => {
  it("keeps a named shop and skips a highway", () => {
    const hits = parseNominatimHits([
      {
        osm_type: "node",
        osm_id: 9,
        lat: "32.78",
        lon: "-96.8",
        name: "EZ EQUIPMENT RENTAL",
        class: "shop",
        type: "tool_hire",
        address: { city: "Dallas", state: "Texas", road: "Harry Hines Blvd" },
      },
      { osm_type: "way", osm_id: 8, lat: "32.7", lon: "-96.8", name: "I-35", class: "highway", type: "motorway" },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("EZ EQUIPMENT RENTAL");
    expect(hits[0].phone).toBe("");
  });
});

describe("mergeFinderHits", () => {
  it("dedupes the same OSM id", () => {
    const a = parseFinderElements(
      [{ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "A Forklift", shop: "rental" } }],
      "forklift",
    );
    const b = parseNominatimHits([{ osm_type: "node", osm_id: 1, lat: "1", lon: "2", name: "A Forklift", class: "shop" }]);
    expect(mergeFinderHits(a, b)).toHaveLength(1);
  });
});

describe("parsePhotonHits", () => {
  it("reads a Komoot Photon feature", () => {
    const hits = parsePhotonHits([
      {
        geometry: { coordinates: [-96.8, 32.78] },
        properties: { osm_id: 11, osm_type: "N", osm_key: "shop", name: "Dallas Lift Rental", city: "Dallas", state: "Texas" },
      },
      {
        geometry: { coordinates: [-96.8, 32.7] },
        properties: { osm_id: 12, osm_type: "W", osm_key: "highway", name: "I-35" },
      },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].osmUrl).toContain("node/11");
  });
});

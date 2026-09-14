import { metroFromPlace } from "./metro";

export type Bbox = { south: number; west: number; north: number; east: number };

export type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type FinderHit = {
  id: string;
  name: string;
  phone: string;
  website: string;
  street: string;
  city: string;
  state: string;
  osmUrl: string;
  lat: number;
  lon: number;
};

const PLACE_BBOX: Record<string, Bbox> = {
  dallas: { south: 32.55, west: -97.45, north: 33.25, east: -96.45 },
  fortworth: { south: 32.55, west: -97.55, north: 32.95, east: -97.1 },
  houston: { south: 29.45, west: -95.85, north: 30.15, east: -94.95 },
  austin: { south: 30.1, west: -98.0, north: 30.55, east: -97.5 },
  sanantonio: { south: 29.25, west: -98.75, north: 29.65, east: -98.25 },
  waco: { south: 31.4, west: -97.3, north: 31.7, east: -96.95 },
  east: { south: 32.2, west: -95.5, north: 32.5, east: -95.15 },
  west: { south: 31.7, west: -102.5, north: 32.1, east: -102.0 },
  valley: { south: 27.4, west: -99.6, north: 27.7, east: -99.35 },
};

export const FINDER_UA = "HaulFreight/1.0 (local prospecting desk; OpenStreetMap Overpass)";

export function bboxAround(lat: number, lon: number, km = 28): Bbox {
  const dLat = km / 111;
  const dLon = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
}

export function bboxForPlace(place: string): Bbox | null {
  const metro = metroFromPlace(place);
  if (metro && PLACE_BBOX[metro.id]) return PLACE_BBOX[metro.id];
  return null;
}

export function osmRegex(value: string) {
  return String(value || "")
    .trim()
    .slice(0, 48)
    .replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export function finderSearchTerms(query: string, place: string) {
  const q = String(query || "").trim() || "forklift";
  const p = String(place || "").trim() || "Dallas TX";
  const terms = [`${q} ${p}`];
  if (!/rental/i.test(q)) terms.push(`equipment rental ${p}`);
  if (!/dealer|machinery/i.test(q)) terms.push(`machinery dealer ${p}`);
  return [...new Set(terms)];
}

export function overpassQuery(query: string, bbox: Bbox) {
  const rx = osmRegex(query) || "forklift";
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:15];
(
  nwr["name"~"${rx}",i](${box});
  nwr["shop"~"rental|tool_hire|trade|agrarian"](${box});
  nwr["name"~"equipment|machinery|forklift|bobcat|rental",i](${box});
);
out center tags 40;`;
}

function tag(tags: Record<string, string> | undefined, key: string) {
  return String(tags?.[key] || "").trim();
}

export function parseFinderElements(elements: OsmElement[], query: string): FinderHit[] {
  const words = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const hits: FinderHit[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const tags = el.tags || {};
    const name = tag(tags, "name") || tag(tags, "operator");
    if (!name) continue;
    const shop = tag(tags, "shop").toLowerCase();
    const hay = `${name} ${shop} ${tag(tags, "craft")} ${tag(tags, "industrial")}`.toLowerCase();
    const named = words.length === 0 || words.some((word) => hay.includes(word));
    const yardish = /rental|agrarian|trade|tool_hire/.test(shop) || /equipment|machinery|forklift|bobcat|rental|dealer|lift/.test(hay);
    if (!named && !yardish) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const street = [tag(tags, "addr:housenumber"), tag(tags, "addr:street")].filter(Boolean).join(" ");
    hits.push({
      id,
      name,
      phone: tag(tags, "phone") || tag(tags, "contact:phone"),
      website: tag(tags, "website") || tag(tags, "contact:website"),
      street,
      city: tag(tags, "addr:city"),
      state: tag(tags, "addr:state"),
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      lat,
      lon,
    });
  }
  return hits.slice(0, 40);
}

export type NominatimPlace = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  class?: string;
  type?: string;
  address?: Record<string, string>;
};

const SKIP_CLASS = /^(highway|place|boundary|landuse|waterway|railway|natural)$/;

export function parseNominatimHits(places: NominatimPlace[]): FinderHit[] {
  const hits: FinderHit[] = [];
  const seen = new Set<string>();
  for (const item of places || []) {
    if (SKIP_CLASS.test(String(item.class || ""))) continue;
    const osmType = String(item.osm_type || "node").toLowerCase();
    const osmId = Number(item.osm_id);
    if (!osmId) continue;
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const addr = item.address || {};
    const name = String(item.name || "").trim() || String(item.display_name || "").split(",")[0]?.trim();
    if (!name) continue;
    const id = `${osmType}/${osmId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    hits.push({
      id,
      name,
      phone: "",
      website: "",
      street: [addr.house_number, addr.road].filter(Boolean).join(" "),
      city: addr.city || addr.town || addr.village || addr.hamlet || "",
      state: addr.state || "",
      osmUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
      lat,
      lon,
    });
  }
  return hits.slice(0, 40);
}

export type PhotonPlace = {
  geometry?: { coordinates?: number[] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
  };
};

function photonOsmType(value: string) {
  const key = String(value || "").toUpperCase();
  if (key === "W" || key === "WAY") return "way";
  if (key === "R" || key === "RELATION") return "relation";
  return "node";
}

export function parsePhotonHits(features: PhotonPlace[]): FinderHit[] {
  const hits: FinderHit[] = [];
  const seen = new Set<string>();
  for (const item of features || []) {
    const props = item.properties || {};
    if (SKIP_CLASS.test(String(props.osm_key || ""))) continue;
    const osmId = Number(props.osm_id);
    if (!osmId) continue;
    const coords = item.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const name = String(props.name || "").trim();
    if (!name) continue;
    const osmType = photonOsmType(String(props.osm_type || ""));
    const id = `${osmType}/${osmId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    hits.push({
      id,
      name,
      phone: "",
      website: "",
      street: [props.housenumber, props.street].filter(Boolean).join(" "),
      city: props.city || "",
      state: props.state || "",
      osmUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
      lat: coords[1],
      lon: coords[0],
    });
  }
  return hits.slice(0, 40);
}

export function mergeFinderHits(...lists: FinderHit[][]) {
  const seen = new Set<string>();
  const hits: FinderHit[] = [];
  for (const list of lists) {
    for (const hit of list) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      hits.push(hit);
    }
  }
  return hits.slice(0, 40);
}

export function finderSourceLabel() {
  return "OpenStreetMap";
}

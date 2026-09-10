import { cookies } from "next/headers";
import { jsonError, jsonOk, logError } from "@/lib/http";
import { validSession } from "@/lib/auth";
import {
  FINDER_UA,
  bboxAround,
  bboxForPlace,
  finderSearchTerms,
  mergeFinderHits,
  overpassQuery,
  parseFinderElements,
  parseNominatimHits,
  parsePhotonHits,
  type Bbox,
  type NominatimPlace,
  type OsmElement,
  type PhotonPlace,
} from "@/lib/finder";
import { huntPlaceParts } from "@/lib/hunt";

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const cache = new Map<string, { at: number; hits: ReturnType<typeof parseFinderElements>; note: string }>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodePlace(place: string): Promise<Bbox | null> {
  const known = bboxForPlace(place);
  if (known) return known;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(place)}&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": FINDER_UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { features?: { geometry?: { coordinates?: number[] } }[] };
  const coords = json.features?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  return bboxAround(coords[1], coords[0], 28);
}

async function nominatimLookup(term: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=20&countrycodes=us&q=${encodeURIComponent(term)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": FINDER_UA, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  return parseNominatimHits((await res.json()) as NominatimPlace[]);
}

async function photonSearch(term: string) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&limit=20&lang=en`;
  const res = await fetch(url, { headers: { "User-Agent": FINDER_UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const json = (await res.json()) as { features?: PhotonPlace[] };
  return parsePhotonHits(json.features || []);
}

async function overpass(query: string, bbox: Bbox) {
  const body = overpassQuery(query, bbox);
  let last = "";
  for (const host of OVERPASS) {
    try {
      const res = await fetch(host, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": FINDER_UA },
        body: `data=${encodeURIComponent(body)}`,
        signal: AbortSignal.timeout(28000),
      });
      if (!res.ok) {
        last = `${host} ${res.status}`;
        continue;
      }
      const json = (await res.json()) as { elements?: OsmElement[] };
      return json.elements || [];
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(last || "Overpass did not answer.");
}

export async function GET(request: Request) {
  const sessionOk = await validSession(cookies().get("lumen_session")?.value);
  if (!sessionOk) return jsonError("Unauthorized", 401);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "forklift dealer").trim().slice(0, 80);
  const place = (url.searchParams.get("place") || "Dallas TX").trim().slice(0, 80);
  const key = `${query}|${place}`.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    return jsonOk({ hits: cached.hits, note: cached.note, cached: true, provider: "OpenStreetMap" });
  }
  try {
    const { state } = huntPlaceParts(place);
    const terms = finderSearchTerms(query, place);
    const [named, photon, bbox] = await Promise.all([nominatimLookup(terms[0]), photonSearch(terms[0]), geocodePlace(place)]);
    let overpassHits: ReturnType<typeof parseFinderElements> = [];
    let usedOverpass = false;
    if (bbox) {
      try {
        overpassHits = parseFinderElements(await overpass(query, bbox), query);
        usedOverpass = true;
      } catch (error) {
        logError("GET /api/finder overpass", error);
      }
    }
    let mapped = mergeFinderHits(named, photon, overpassHits);
    if (mapped.length < 12 && terms[1]) {
      await sleep(1100);
      mapped = mergeFinderHits(mapped, await nominatimLookup(terms[1]), await photonSearch(terms[1]));
    }
    if (!mapped.length && !usedOverpass && !named.length && !photon.length) {
      return jsonError("Customer finder could not reach OpenStreetMap. Try again in a minute, or paste a page.", 502);
    }
    const cityGuess = place.replace(/\s+[A-Z]{2}$/, "");
    const hits = mapped.map((hit) => ({
      ...hit,
      state: hit.state || state,
      city: hit.city || cityGuess,
    }));
    const note =
      hits.length === 0
        ? "OpenStreetMap had no tagged yards in that area. Volunteer map data — most US dealers are missing. Paste a page from Discover Hunt instead."
        : "Nominatim + Photon + Overpass. Phones and sites only if OSM tagged them. Open their site before you dial. Hunt paste still finds yards OSM never mapped.";
    cache.set(key, { at: Date.now(), hits, note });
    return jsonOk({ hits, note, cached: false, provider: "OpenStreetMap" });
  } catch (error) {
    logError("GET /api/finder", error);
    return jsonError("Customer finder could not reach OpenStreetMap. Try again in a minute, or paste a page.", 502);
  }
}

import { NextResponse } from "next/server";
import { CITIES } from "@/lib/geo";

type GeoResult = {
  label: string;
  latitude: number;
  longitude: number;
  source: string;
};

function cityFallback(query: string): GeoResult[] {
  const q = query.toLowerCase();
  return Object.entries(CITIES)
    .filter(([name]) => q.includes(name.toLowerCase()))
    .map(([name, coords]) => ({
      label: query.length > name.length ? query : `${name}, United States`,
      latitude: coords.lat,
      longitude: coords.lng,
      source: "Meridian city atlas",
    }));
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 3) {
    return NextResponse.json({ error: "Query too short", results: [] }, { status: 400 });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("countrycodes", "us");
    url.searchParams.set("limit", "5");
    const response = await fetch(url, {
      headers: { "User-Agent": "MeridianCRM/0.1 (local solar desk)" },
      cache: "no-store",
    });
    if (response.ok) {
      const rows = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      const results = rows.map((row) => ({
        label: row.display_name,
        latitude: Number(row.lat),
        longitude: Number(row.lon),
        source: "OpenStreetMap Nominatim",
      }));
      if (results.length) return NextResponse.json({ results });
    }
  } catch {
    /* fall through to city atlas */
  }

  const results = cityFallback(q);
  if (!results.length) {
    return NextResponse.json({ error: "No U.S. address matched", results: [] }, { status: 404 });
  }
  return NextResponse.json({ results });
}

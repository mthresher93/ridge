export const CITIES: Record<string, { lat: number; lng: number }> = {
  Bakersfield: { lat: 35.3733, lng: -119.0187 },
  Fresno: { lat: 36.7378, lng: -119.7871 },
  "San Diego": { lat: 32.7157, lng: -117.1611 },
  "Las Vegas": { lat: 36.1699, lng: -115.1398 },
  Phoenix: { lat: 33.4484, lng: -112.074 },
  Sacramento: { lat: 38.5816, lng: -121.4944 },
  Riverside: { lat: 33.9533, lng: -117.3962 },
  Stockton: { lat: 37.9577, lng: -121.2908 },
  "San Jose": { lat: 37.3382, lng: -121.8863 },
};

function hash(value: string) {
  let n = 0;
  for (let i = 0; i < value.length; i += 1) n = (n * 31 + value.charCodeAt(i)) >>> 0;
  return n;
}

export function coordsFor(city: string, id = "") {
  const base = CITIES[city] || { lat: 36.7783, lng: -119.4179 };
  const n = hash(`${city}:${id}`);
  return {
    lat: base.lat + ((n % 80) - 40) * 0.0018,
    lng: base.lng + (((n >> 7) % 80) - 40) * 0.0022,
  };
}

export function lngLatToWorld(lng: number, lat: number) {
  const x = (lng + 180) / 360;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return { x, y };
}

export function worldToLngLat(x: number, y: number) {
  const lng = x * 360 - 180;
  const n = Math.PI * (1 - 2 * y);
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lng, lat };
}

export function feetPerPixel(lat: number, zoom: number) {
  const meters = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return meters * 3.28084;
}

export function tileUrl(kind: "satellite" | "streets", z: number, x: number, y: number) {
  if (kind === "satellite") {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  }
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

const FT_PER_DEG_LAT = 364000;

export function siteToLngLat(origin: { lat: number; lng: number }, eastFt: number, northFt: number) {
  const cos = Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180));
  return {
    lng: origin.lng + eastFt / (FT_PER_DEG_LAT * cos),
    lat: origin.lat + northFt / FT_PER_DEG_LAT,
  };
}

export function lngLatToSite(origin: { lat: number; lng: number }, lng: number, lat: number) {
  const cos = Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180));
  return {
    x: (lng - origin.lng) * FT_PER_DEG_LAT * cos,
    y: (lat - origin.lat) * FT_PER_DEG_LAT,
  };
}

export function projectToScreen(
  lng: number,
  lat: number,
  view: { lng: number; lat: number; zoom: number; width: number; height: number },
) {
  const TILE = 256;
  const scale = TILE * 2 ** view.zoom;
  const world = lngLatToWorld(lng, lat);
  const center = lngLatToWorld(view.lng, view.lat);
  return {
    x: view.width / 2 + (world.x - center.x) * scale,
    y: view.height / 2 + (world.y - center.y) * scale,
  };
}

export function screenToLngLat(
  x: number,
  y: number,
  view: { lng: number; lat: number; zoom: number; width: number; height: number },
) {
  const TILE = 256;
  const scale = TILE * 2 ** view.zoom;
  const center = lngLatToWorld(view.lng, view.lat);
  const worldX = center.x + (x - view.width / 2) / scale;
  const worldY = center.y + (y - view.height / 2) / scale;
  return worldToLngLat(worldX, worldY);
}

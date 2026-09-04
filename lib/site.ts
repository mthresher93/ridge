import type { PlacedModule, Point, RoofDesign, RoofFace } from "./types";
import { uid } from "./format";

export function polygonArea(points: Point[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function edgeLengths(points: Point[]) {
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
}

export function pointInPolygon(point: Point, points: Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    const hit = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 1e-9) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

export function classifyEdge(points: Point[], index: number, azimuthDeg: number) {
  const a = points[index];
  const b = points[(index + 1) % points.length];
  const angle = ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
  const diff = Math.min(Math.abs(angle - azimuthDeg), 360 - Math.abs(angle - azimuthDeg));
  if (diff < 25) return "Ridge";
  if (diff > 155) return "Eave";
  return "Rake";
}

export function defaultFace(usableSqFt: number, azimuthDeg: number, tiltDeg: number): RoofFace {
  const width = Math.max(28, Math.round(Math.sqrt(usableSqFt) * 1.15));
  const depth = Math.max(18, Math.round(usableSqFt / width));
  return {
    id: uid("face"),
    points: [
      { x: -width / 2, y: -depth / 2 },
      { x: width / 2, y: -depth / 2 },
      { x: width / 2, y: depth / 2 },
      { x: -width / 2, y: depth / 2 },
    ],
    pitchDeg: tiltDeg,
    azimuthDeg,
    heightFt: 12,
    material: "Composition shingle",
  };
}

export function ensureSite(design: RoofDesign): RoofDesign {
  if (design.faces?.length) return design;
  return {
    ...design,
    setbackFt: design.setbackFt ?? 3,
    panelWidthIn: design.panelWidthIn ?? 41,
    panelHeightIn: design.panelHeightIn ?? 74,
    spacingIn: design.spacingIn ?? 0.5,
    faces: [defaultFace(design.usableSqFt, design.azimuthDeg, design.tiltDeg)],
    obstructions: design.obstructions || [],
    modules: design.modules || [],
  };
}

export function fillFace(face: RoofFace, design: RoofDesign, existing: PlacedModule[]): PlacedModule[] {
  const setback = design.setbackFt ?? 3;
  const w = (design.panelWidthIn ?? 41) / 12;
  const h = (design.panelHeightIn ?? 74) / 12;
  const gap = (design.spacingIn ?? 0.5) / 12;
  const xs = face.points.map((p) => p.x);
  const ys = face.points.map((p) => p.y);
  const minX = Math.min(...xs) + setback;
  const maxX = Math.max(...xs) - setback;
  const minY = Math.min(...ys) + setback;
  const maxY = Math.max(...ys) - setback;
  const next: PlacedModule[] = [];
  const blocked = design.obstructions || [];

  for (let y = minY; y + h <= maxY; y += h + gap) {
    for (let x = minX; x + w <= maxX; x += w + gap) {
      const corners = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ];
      if (!corners.every((corner) => pointInPolygon(corner, face.points))) continue;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const hitsGear = blocked.some((item) => Math.abs(item.x - cx) < item.widthFt / 2 + 1 && Math.abs(item.y - cy) < item.lengthFt / 2 + 1);
      if (hitsGear) continue;
      next.push({
        id: uid("mod"),
        faceId: face.id,
        x,
        y,
        rotationDeg: face.azimuthDeg,
        portrait: true,
      });
    }
  }
  return [...existing.filter((item) => item.faceId !== face.id), ...next];
}

export function liveMetrics(design: RoofDesign) {
  const site = ensureSite(design);
  const roofSqFt = (site.faces || []).reduce((sum, face) => sum + polygonArea(face.points), 0);
  const count = site.modules?.length || 0;
  const systemKw = Math.round((count * site.panelWatts) / 100) / 10;
  const panelSqFt = count * ((site.panelWidthIn ?? 41) / 12) * ((site.panelHeightIn ?? 74) / 12);
  return {
    roofSqFt: Math.round(roofSqFt),
    panelCount: count,
    systemKw,
    coverage: roofSqFt ? Math.round((panelSqFt / roofSqFt) * 100) : 0,
  };
}

export function formatFeet(ft: number) {
  const sign = ft < 0 ? "-" : "";
  const abs = Math.abs(ft);
  const whole = Math.floor(abs);
  const inches = Math.round((abs - whole) * 12);
  if (inches === 12) return `${sign}${whole + 1} ft`;
  if (inches === 0) return `${sign}${whole} ft`;
  return `${sign}${whole} ft ${inches} in`;
}

export function parseFeetInches(value: string) {
  const text = value.trim().toLowerCase();
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*(?:ft|')?\s*(-?\d+(?:\.\d+)?)?\s*(?:in|")?$/);
  if (!match) {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  return Number(match[1]) + Number(match[2] || 0) / 12;
}

export function centroid(points: Point[]) {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}

export function rotatePoints(points: Point[], deg: number) {
  const c = centroid(points);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  });
}

export function syncLegacy(design: RoofDesign): RoofDesign {
  const site = ensureSite(design);
  const face = site.faces?.[0];
  const live = liveMetrics(site);
  return {
    ...site,
    azimuthDeg: face?.azimuthDeg ?? site.azimuthDeg,
    tiltDeg: face?.pitchDeg ?? site.tiltDeg,
    usableSqFt: live.roofSqFt || site.usableSqFt,
    roofMaterial: face?.material || site.roofMaterial,
  };
}

/** Bounding box of faces/modules in site feet, for Fit framing. */
export function siteBounds(design: RoofDesign) {
  const site = ensureSite(design);
  const points: Point[] = [];
  for (const face of site.faces || []) points.push(...face.points);
  for (const mod of site.modules || []) {
    const w = (site.panelWidthIn ?? 41) / 12;
    const h = (site.panelHeightIn ?? 74) / 12;
    points.push({ x: mod.x, y: mod.y }, { x: mod.x + w, y: mod.y + h });
  }
  for (const gear of site.obstructions || []) {
    points.push({ x: gear.x - gear.widthFt / 2, y: gear.y - gear.lengthFt / 2 }, { x: gear.x + gear.widthFt / 2, y: gear.y + gear.lengthFt / 2 });
  }
  if (!points.length) return { minX: -40, maxX: 40, minY: -30, maxY: 30, cx: 0, cy: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

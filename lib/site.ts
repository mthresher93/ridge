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
  return {
    ...design,
    setbackFt: design.setbackFt ?? 3,
    panelWidthIn: design.panelWidthIn ?? 41,
    panelHeightIn: design.panelHeightIn ?? 74,
    spacingIn: design.spacingIn ?? 0.5,
    faces: design.faces || [],
    obstructions: design.obstructions || [],
    modules: design.modules || [],
  };
}

/** A real roof plane is tens to a few thousand square feet, not a city block. */
export function plausibleGeometry(design: RoofDesign) {
  const faces = design.faces || [];
  if (!faces.length) return true;
  for (const face of faces) {
    if (face.points.length < 3) return false;
    const area = polygonArea(face.points);
    if (area < 40 || area > 120000) return false;
    if (edgeLengths(face.points).some((len) => len > 800)) return false;
    if (face.points.some((pt) => Math.hypot(pt.x, pt.y) > 120000)) return false;
  }
  return true;
}

/** Clustered geometry miles from the site origin was drawn against a null origin. */
export function recenterOrphaned(design: RoofDesign): RoofDesign {
  const faces = design.faces || [];
  if (!faces.length) return design;
  const bounds = faceBounds(faces);
  const far = Math.hypot(bounds.cx, bounds.cy);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  if (far < 8000 || span > 2500) return design;
  const dx = -bounds.cx;
  const dy = -bounds.cy;
  return {
    ...design,
    faces: faces.map((face) => ({ ...face, points: translatePoints(face.points, dx, dy) })),
    modules: (design.modules || []).map((mod) => ({ ...mod, x: mod.x + dx, y: mod.y + dy })),
    obstructions: (design.obstructions || []).map((item) => ({ ...item, x: item.x + dx, y: item.y + dy })),
  };
}

function nearFaces(point: Point, faces: RoofFace[], maxFt = 400) {
  if (!faces.length) return Math.hypot(point.x, point.y) < maxFt;
  return faces.some((face) => {
    const c = centroid(face.points);
    const reach = Math.max(...edgeLengths(face.points), 40);
    return Math.hypot(point.x - c.x, point.y - c.y) < maxFt + reach;
  });
}

/** Drop modules/obstructions that are not on the surveyed site. */
export function sanitizeSite(design: RoofDesign): RoofDesign {
  const parked = recenterOrphaned(design);
  const faces = parked.faces || [];
  return {
    ...parked,
    modules: (parked.modules || []).filter((mod) => nearFaces({ x: mod.x, y: mod.y }, faces)),
    obstructions: (parked.obstructions || []).filter((item) => nearFaces({ x: item.x, y: item.y }, faces)),
  };
}

function faceBounds(faces: RoofFace[]) {
  const points = faces.flatMap((face) => face.points);
  if (!points.length) return { minX: -40, maxX: 40, minY: -30, maxY: 30, cx: 0, cy: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function moduleFootprint(design: RoofDesign, portrait = true) {
  const shortSide = (design.panelWidthIn ?? 41) / 12;
  const longSide = (design.panelHeightIn ?? 74) / 12;
  return portrait ? { w: shortSide, h: longSide } : { w: longSide, h: shortSide };
}

export function moduleCorners(mod: PlacedModule, design: RoofDesign): Point[] {
  const { w, h } = moduleFootprint(design, mod.portrait !== false);
  const cx = mod.x + w / 2;
  const cy = mod.y + h / 2;
  const rad = ((mod.rotationDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const local = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  return local.map((p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }));
}

export function insetTowardCentroid(points: Point[], ft: number) {
  if (points.length < 3 || ft <= 0) return points;
  const c = centroid(points);
  return points.map((p) => {
    const d = Math.hypot(p.x - c.x, p.y - c.y) || 1;
    const t = Math.max(0.15, (d - ft) / d);
    return { x: c.x + (p.x - c.x) * t, y: c.y + (p.y - c.y) * t };
  });
}

function lineIntersect(a: Point, b: Point, c: Point, d: Point): Point | null {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Parallel-edge setback. Falls back to centroid inset if the offset collapses. */
export function insetPolygon(points: Point[], ft: number): Point[] {
  if (points.length < 3 || ft <= 0) return points;
  let ring = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    ring += a.x * b.y - b.x * a.y;
  }
  const left = ring >= 0;
  const n = points.length;
  const shifted = points.map((_, i) => {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (left ? -dy : dy) / len;
    const ny = (left ? dx : -dx) / len;
    return {
      a: { x: a.x + nx * ft, y: a.y + ny * ft },
      b: { x: b.x + nx * ft, y: b.y + ny * ft },
    };
  });
  const next = shifted.map((edge, i) => {
    const prev = shifted[(i - 1 + n) % n];
    return lineIntersect(prev.a, prev.b, edge.a, edge.b);
  });
  if (next.some((pt) => !pt)) return insetTowardCentroid(points, ft);
  const inner = next as Point[];
  const innerArea = polygonArea(inner);
  const outerArea = polygonArea(points);
  if (innerArea <= 4 || innerArea >= outerArea) return insetTowardCentroid(points, ft);
  return inner;
}

export function fillFace(face: RoofFace, design: RoofDesign, existing: PlacedModule[], portrait = true): PlacedModule[] {
  if (face.eligible === false) return existing.filter((item) => item.faceId !== face.id);
  const setback = design.setbackFt ?? 3;
  const { w, h } = moduleFootprint(design, portrait);
  const gap = (design.spacingIn ?? 0.5) / 12;
  const inner = insetPolygon(face.points, setback);
  const xs = inner.map((p) => p.x);
  const ys = inner.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
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
      if (!corners.every((corner) => pointInPolygon(corner, inner))) continue;
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
        portrait,
      });
      if (next.length >= 320) {
        return [...existing.filter((item) => item.faceId !== face.id), ...next];
      }
    }
  }
  return [...existing.filter((item) => item.faceId !== face.id), ...next];
}

export function liveMetrics(design: RoofDesign) {
  const site = ensureSite(design);
  const roofSqFt = (site.faces || []).reduce((sum, face) => sum + polygonArea(face.points), 0);
  const eligibleSqFt = (site.faces || [])
    .filter((face) => face.eligible !== false)
    .reduce((sum, face) => sum + polygonArea(face.points), 0);
  const count = site.modules?.length || 0;
  const systemKw = Math.round((count * site.panelWatts) / 100) / 10;
  const panelSqFt = Math.round(
    (site.modules || []).reduce((sum, mod) => {
      const fp = moduleFootprint(site, mod.portrait !== false);
      return sum + fp.w * fp.h;
    }, 0) * 10,
  ) / 10;
  const setback = site.setbackFt ?? 3;
  const usableSqFt = Math.round(
    (site.faces || []).reduce((sum, face) => {
      if (face.eligible === false) return sum;
      return sum + polygonArea(insetPolygon(face.points, setback));
    }, 0),
  );
  return {
    roofSqFt: Math.round(roofSqFt),
    eligibleSqFt: Math.round(eligibleSqFt),
    usableSqFt,
    panelSqFt,
    panelCount: count,
    systemKw,
    coverage: roofSqFt ? Math.round((panelSqFt / roofSqFt) * 100) : 0,
    setbackFt: setback,
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

export function translatePoints(points: Point[], dx: number, dy: number) {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function closestOnSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return { point: { x: a.x + t * dx, y: a.y + t * dy }, t };
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

/** Bounding box of the surveyed roof. Distant leftover marks are ignored. */
export function siteBounds(design: RoofDesign) {
  const site = ensureSite(design);
  const faces = site.faces || [];
  const points: Point[] = [];
  for (const face of faces) points.push(...face.points);
  for (const mod of site.modules || []) {
    if (!nearFaces({ x: mod.x, y: mod.y }, faces)) continue;
    const w = (site.panelWidthIn ?? 41) / 12;
    const h = (site.panelHeightIn ?? 74) / 12;
    points.push({ x: mod.x, y: mod.y }, { x: mod.x + w, y: mod.y + h });
  }
  for (const gear of site.obstructions || []) {
    if (!nearFaces({ x: gear.x, y: gear.y }, faces)) continue;
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

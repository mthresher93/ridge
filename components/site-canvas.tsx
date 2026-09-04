"use client";

import { useState } from "react";
import type { MapView } from "./tile-map";
import { feetPerPixel, projectToScreen, screenToLngLat, siteToLngLat, lngLatToSite } from "@/lib/geo";
import {
  classifyEdge,
  edgeLengths,
  formatFeet,
  insetTowardCentroid,
  moduleCorners,
  moduleFootprint,
  polygonArea,
  rotatePoints,
} from "@/lib/site";
import { uid } from "@/lib/format";
import type { Obstruction, ObstructionKind, PlacedModule, Point, RoofDesign, RoofFace } from "@/lib/types";

export type CadTool = "pan" | "select" | "draw" | "vertex" | "panel" | "gear" | "tree" | "measure";

export type CadSel =
  | { kind: "face"; id: string }
  | { kind: "vertex"; id: string; index: number }
  | { kind: "edge"; id: string; index: number }
  | { kind: "module"; id: string }
  | { kind: "obstruction"; id: string }
  | null;

type DragState =
  | { kind: "vertex"; id: string; index: number }
  | { kind: "module"; id: string; origin: Point; start: Point }
  | { kind: "obstruction"; id: string; origin: Point; start: Point }
  | null;

export function SiteCanvas({
  design,
  view,
  tool,
  sel,
  onSel,
  onChange,
  draft,
  onDraft,
}: {
  design: RoofDesign;
  view: MapView;
  tool: CadTool;
  sel: CadSel;
  onSel: (next: CadSel) => void;
  onChange: (next: RoofDesign) => void;
  draft: Point[];
  onDraft: (next: Point[]) => void;
}) {
  const origin = { lat: design.lat || 0, lng: design.lng || 0 };
  const fpp = feetPerPixel(origin.lat, view.zoom);
  const hitFt = Math.max(4, 10 * fpp);
  const [drag, setDrag] = useState<DragState>(null);
  const [measure, setMeasure] = useState<Point[]>([]);

  const faces = design.faces || [];
  const modules = design.modules || [];
  const gear = design.obstructions || [];
  const setback = design.setbackFt ?? 3;

  function toSite(clientX: number, clientY: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const geo = screenToLngLat(clientX - rect.left, clientY - rect.top, view);
    return lngLatToSite(origin, geo.lng, geo.lat);
  }

  function toScreen(point: Point) {
    const geo = siteToLngLat(origin, point.x, point.y);
    return projectToScreen(geo.lng, geo.lat, view);
  }

  function hitFace(point: Point) {
    for (let i = faces.length - 1; i >= 0; i -= 1) {
      const face = faces[i];
      if (inside(point, face.points)) return face;
    }
    return null;
  }

  function hitModule(point: Point) {
    for (let i = modules.length - 1; i >= 0; i -= 1) {
      const mod = modules[i];
      if (inside(point, moduleCorners(mod, design))) return mod;
    }
    return null;
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (tool === "pan") return;
    event.stopPropagation();
    const svg = event.currentTarget;
    const site = toSite(event.clientX, event.clientY, svg);

    if (tool === "draw") {
      onDraft([...draft, site]);
      onSel(null);
      return;
    }
    if (tool === "measure") {
      setMeasure((prev) => [...prev, site].slice(-2));
      return;
    }
    if (tool === "panel") {
      const face = hitFace(site);
      if (!face || face.eligible === false) return;
      const { w, h } = moduleFootprint(design, true);
      const mod: PlacedModule = {
        id: uid("mod"),
        faceId: face.id,
        x: site.x - w / 2,
        y: site.y - h / 2,
        rotationDeg: face.azimuthDeg,
        portrait: true,
      };
      onChange({ ...design, modules: [...modules, mod] });
      onSel({ kind: "module", id: mod.id });
      return;
    }
    if (tool === "gear" || tool === "tree") {
      const kind: ObstructionKind = tool === "tree" ? "tree" : "vent";
      const item: Obstruction = {
        id: uid("obs"),
        kind,
        x: site.x,
        y: site.y,
        widthFt: kind === "tree" ? 18 : 3,
        lengthFt: kind === "tree" ? 18 : 3,
        heightFt: kind === "tree" ? 28 : 2,
      };
      onChange({ ...design, obstructions: [...gear, item] });
      onSel({ kind: "obstruction", id: item.id });
      return;
    }

    const vertexHit = nearestVertex(faces, site, hitFt);
    if (vertexHit && (tool === "vertex" || tool === "select")) {
      onSel({ kind: "vertex", id: vertexHit.id, index: vertexHit.index });
      setDrag({ kind: "vertex", id: vertexHit.id, index: vertexHit.index });
      return;
    }
    const edgeHit = nearestEdge(faces, site, hitFt);
    if (edgeHit && tool === "select") {
      onSel({ kind: "edge", id: edgeHit.id, index: edgeHit.index });
      return;
    }
    const modHit = hitModule(site);
    if (modHit && tool === "select") {
      onSel({ kind: "module", id: modHit.id });
      setDrag({ kind: "module", id: modHit.id, origin: { x: modHit.x, y: modHit.y }, start: site });
      return;
    }
    const gearHit = gear.find((item) => Math.abs(item.x - site.x) <= item.widthFt / 2 && Math.abs(item.y - site.y) <= item.lengthFt / 2);
    if (gearHit && tool === "select") {
      onSel({ kind: "obstruction", id: gearHit.id });
      setDrag({ kind: "obstruction", id: gearHit.id, origin: { x: gearHit.x, y: gearHit.y }, start: site });
      return;
    }
    const face = hitFace(site);
    onSel(face ? { kind: "face", id: face.id } : null);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    event.stopPropagation();
    const site = toSite(event.clientX, event.clientY, event.currentTarget);
    if (drag.kind === "vertex") {
      onChange({
        ...design,
        faces: faces.map((face) =>
          face.id === drag.id ? { ...face, points: face.points.map((pt, i) => (i === drag.index ? site : pt)) } : face,
        ),
      });
      return;
    }
    if (drag.kind === "module") {
      const dx = site.x - drag.start.x;
      const dy = site.y - drag.start.y;
      onChange({
        ...design,
        modules: modules.map((mod) => (mod.id === drag.id ? { ...mod, x: drag.origin.x + dx, y: drag.origin.y + dy } : mod)),
      });
      return;
    }
    if (drag.kind === "obstruction") {
      const dx = site.x - drag.start.x;
      const dy = site.y - drag.start.y;
      onChange({
        ...design,
        obstructions: gear.map((item) => (item.id === drag.id ? { ...item, x: drag.origin.x + dx, y: drag.origin.y + dy } : item)),
      });
    }
  }

  function onDoubleClick() {
    if (tool === "draw" && draft.length >= 3) {
      const face: RoofFace = {
        id: uid("face"),
        points: draft,
        pitchDeg: design.tiltDeg,
        azimuthDeg: design.azimuthDeg,
        heightFt: 12,
        material: design.roofMaterial,
        eligible: true,
      };
      onChange({ ...design, faces: [...faces, face] });
      onDraft([]);
      onSel({ kind: "face", id: face.id });
    }
  }

  const measureLen =
    measure.length === 2 ? Math.hypot(measure[1].x - measure[0].x, measure[1].y - measure[0].y) : 0;

  const selectedFace = sel?.kind === "face" || sel?.kind === "vertex" || sel?.kind === "edge" ? faces.find((f) => f.id === sel.id) : null;

  return (
    <svg
      className={`site-svg tool-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDrag(null)}
      onDoubleClick={onDoubleClick}
    >
      {faces.map((face) => {
        const pts = face.points.map(toScreen);
        const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
        const active = selectedFace?.id === face.id;
        const lengths = edgeLengths(face.points);
        const inset = active ? insetTowardCentroid(face.points, setback).map(toScreen) : [];
        return (
          <g key={face.id}>
            <polygon
              points={poly}
              className={`roof-face ${active ? "on" : ""} ${face.eligible === false ? "blocked" : ""}`}
            />
            {active && inset.length >= 3 ? (
              <polygon points={inset.map((p) => `${p.x},${p.y}`).join(" ")} className="roof-setback" />
            ) : null}
            {active
              ? face.points.map((a, i) => {
                  const b = face.points[(i + 1) % face.points.length];
                  const mid = toScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                  const kind = classifyEdge(face.points, i, face.azimuthDeg);
                  const edgeOn = sel?.kind === "edge" && sel.id === face.id && sel.index === i;
                  return (
                    <g key={`${face.id}-e${i}`}>
                      {edgeOn ? (
                        <line
                          x1={toScreen(a).x}
                          y1={toScreen(a).y}
                          x2={toScreen(b).x}
                          y2={toScreen(b).y}
                          className="roof-edge-on"
                        />
                      ) : null}
                      <text x={mid.x} y={mid.y} className="cad-label">
                        {kind} {formatFeet(lengths[i])}
                      </text>
                    </g>
                  );
                })
              : null}
            {face.points.map((pt, i) => {
              const p = toScreen(pt);
              const on = sel?.kind === "vertex" && sel.id === face.id && sel.index === i;
              return <circle key={`${face.id}-v${i}`} cx={p.x} cy={p.y} r={on ? 7 : 5} className={`roof-vert ${on ? "on" : ""}`} />;
            })}
            <text x={pts[0]?.x || 0} y={(pts[0]?.y || 0) - 8} className="cad-label dim">
              {Math.round(polygonArea(face.points))} ft² · {face.pitchDeg}° · {face.azimuthDeg}°
              {face.eligible === false ? " · blocked" : ""}
            </text>
          </g>
        );
      })}

      {modules.map((mod) => {
        const corners = moduleCorners(mod, design).map(toScreen);
        const on = sel?.kind === "module" && sel.id === mod.id;
        return (
          <polygon
            key={mod.id}
            points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
            className={`mod-cell ${on ? "on" : ""}`}
          />
        );
      })}

      {gear.map((item) => {
        const a = toScreen({ x: item.x - item.widthFt / 2, y: item.y - item.lengthFt / 2 });
        const b = toScreen({ x: item.x + item.widthFt / 2, y: item.y + item.lengthFt / 2 });
        const on = sel?.kind === "obstruction" && sel.id === item.id;
        if (item.kind === "tree") {
          const c = toScreen({ x: item.x, y: item.y });
          const rim = toScreen({ x: item.x + item.widthFt / 2, y: item.y });
          return (
            <circle
              key={item.id}
              cx={c.x}
              cy={c.y}
              r={Math.max(6, Math.abs(rim.x - c.x))}
              className={`obs-tree ${on ? "on" : ""}`}
            />
          );
        }
        return (
          <rect
            key={item.id}
            x={Math.min(a.x, b.x)}
            y={Math.min(a.y, b.y)}
            width={Math.abs(b.x - a.x)}
            height={Math.abs(b.y - a.y)}
            className={`obs-box ${on ? "on" : ""}`}
          />
        );
      })}

      {draft.length ? (
        <polyline
          points={draft
            .map((pt) => {
              const p = toScreen(pt);
              return `${p.x},${p.y}`;
            })
            .join(" ")}
          className="draft-line"
        />
      ) : null}

      {measure.length === 2 ? (
        <>
          <line
            x1={toScreen(measure[0]).x}
            y1={toScreen(measure[0]).y}
            x2={toScreen(measure[1]).x}
            y2={toScreen(measure[1]).y}
            className="measure-line"
          />
          <text x={toScreen(measure[1]).x + 8} y={toScreen(measure[1]).y - 8} className="cad-label">
            {formatFeet(measureLen)}
          </text>
        </>
      ) : null}
    </svg>
  );
}

export function rotateSelectedFace(design: RoofDesign, id: string, deg: number): RoofDesign {
  return {
    ...design,
    faces: (design.faces || []).map((face) => (face.id === id ? { ...face, points: rotatePoints(face.points, deg) } : face)),
  };
}

function inside(point: Point, points: Point[]) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    const crosses = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + 1e-9) + a.x;
    if (crosses) hit = !hit;
  }
  return hit;
}

function nearestVertex(faces: RoofFace[], site: Point, max: number) {
  let best: { id: string; index: number; d: number } | null = null;
  for (const face of faces) {
    for (let index = 0; index < face.points.length; index += 1) {
      const pt = face.points[index];
      const d = Math.hypot(pt.x - site.x, pt.y - site.y);
      if (d <= max && (!best || d < best.d)) best = { id: face.id, index, d };
    }
  }
  return best;
}

function nearestEdge(faces: RoofFace[], site: Point, max: number) {
  let best: { id: string; index: number; d: number } | null = null;
  for (const face of faces) {
    for (let index = 0; index < face.points.length; index += 1) {
      const a = face.points[index];
      const b = face.points[(index + 1) % face.points.length];
      const d = distToSeg(site, a, b);
      if (d <= max && (!best || d < best.d)) best = { id: face.id, index, d };
    }
  }
  return best;
}

function distToSeg(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

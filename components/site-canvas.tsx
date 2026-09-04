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
  orthoFrom,
  polygonArea,
  rotatePoints,
  snapPoint,
  vertexAnchors,
} from "@/lib/site";
import { uid } from "@/lib/format";
import type { Obstruction, ObstructionKind, PlacedModule, Point, RoofDesign, RoofFace } from "@/lib/types";

export type CadTool = "pan" | "select" | "draw" | "vertex" | "panel" | "gear" | "tree" | "measure";

export type CadSel =
  | { kind: "face"; id: string }
  | { kind: "vertex"; id: string; index: number }
  | { kind: "edge"; id: string; index: number }
  | { kind: "module"; id: string; ids?: string[] }
  | { kind: "obstruction"; id: string }
  | null;

type DragState =
  | { kind: "vertex"; id: string; index: number }
  | { kind: "module"; ids: string[]; origins: Record<string, Point>; start: Point }
  | { kind: "obstruction"; id: string; origin: Point; start: Point }
  | null;

type HoverState =
  | { kind: "face"; id: string }
  | { kind: "vertex"; id: string; index: number }
  | { kind: "edge"; id: string; index: number }
  | { kind: "module"; id: string }
  | { kind: "obstruction"; id: string }
  | null;

export function SiteCanvas({
  design,
  view,
  tool,
  sel,
  onSel,
  onChange,
  onGestureStart,
  draft,
  onDraft,
}: {
  design: RoofDesign;
  view: MapView;
  tool: CadTool;
  sel: CadSel;
  onSel: (next: CadSel) => void;
  onChange: (next: RoofDesign) => void;
  onGestureStart?: () => void;
  draft: Point[];
  onDraft: (next: Point[]) => void;
}) {
  const origin = { lat: design.lat || 0, lng: design.lng || 0 };
  const fpp = feetPerPixel(origin.lat, view.zoom);
  const hitFt = Math.max(3.5, 9 * fpp);
  const edgeHitFt = Math.max(5.5, 14 * fpp);
  const snapFt = Math.max(2.5, 7 * fpp);
  const [drag, setDrag] = useState<DragState>(null);
  const [measure, setMeasure] = useState<Point[]>([]);
  const [hover, setHover] = useState<HoverState>(null);
  const [snapGuide, setSnapGuide] = useState<Point | null>(null);
  const [draftCursor, setDraftCursor] = useState<Point | null>(null);

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

  function snapSite(site: Point, opts?: { exclude?: { id: string; index: number }; from?: Point; shift?: boolean }) {
    let next = site;
    if (opts?.shift && opts.from) next = orthoFrom(opts.from, next);
    const anchors = vertexAnchors(faces, opts?.exclude);
    if (draft.length) anchors.push(...draft);
    return snapPoint(next, anchors, snapFt);
  }

  function refine(site: Point, opts?: { exclude?: { id: string; index: number }; from?: Point; shift?: boolean }) {
    const beforeOrtho = opts?.shift && opts.from ? orthoFrom(opts.from, site) : site;
    const snapped = snapSite(site, opts);
    const moved = Math.hypot(snapped.x - beforeOrtho.x, snapped.y - beforeOrtho.y) > 0.05;
    setSnapGuide(moved ? snapped : null);
    return snapped;
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

  function selectedModuleIds() {
    if (sel?.kind !== "module") return [] as string[];
    return sel.ids?.length ? sel.ids : [sel.id];
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (tool === "pan") return;
    event.stopPropagation();
    const svg = event.currentTarget;
    svg.setPointerCapture?.(event.pointerId);
    const raw = toSite(event.clientX, event.clientY, svg);
    const shift = event.shiftKey;

    if (tool === "draw") {
      onGestureStart?.();
      const from = draft[draft.length - 1];
      const site = refine(raw, { from, shift });
      onDraft([...draft, site]);
      onSel(null);
      return;
    }
    if (tool === "measure") {
      const site = refine(raw);
      setMeasure((prev) => [...prev, site].slice(-2));
      return;
    }
    if (tool === "panel") {
      const site = refine(raw);
      const face = hitFace(site);
      if (!face || face.eligible === false) return;
      onGestureStart?.();
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
      const site = refine(raw);
      onGestureStart?.();
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

    const vertexHit = nearestVertex(faces, raw, hitFt);
    if (vertexHit && (tool === "vertex" || tool === "select")) {
      onGestureStart?.();
      onSel({ kind: "vertex", id: vertexHit.id, index: vertexHit.index });
      setDrag({ kind: "vertex", id: vertexHit.id, index: vertexHit.index });
      return;
    }
    const edgeHit = nearestEdge(faces, raw, edgeHitFt);
    if (edgeHit && tool === "select") {
      onSel({ kind: "edge", id: edgeHit.id, index: edgeHit.index });
      return;
    }
    const modHit = hitModule(raw);
    if (modHit && tool === "select") {
      const prev = selectedModuleIds();
      const ids = shift
        ? prev.includes(modHit.id)
          ? prev.filter((id) => id !== modHit.id)
          : [...prev, modHit.id]
        : [modHit.id];
      if (!ids.length) {
        onSel(null);
        return;
      }
      onGestureStart?.();
      onSel({ kind: "module", id: ids[ids.length - 1], ids: ids.length > 1 ? ids : undefined });
      const origins: Record<string, Point> = {};
      for (const id of ids) {
        const row = modules.find((m) => m.id === id);
        if (row) origins[id] = { x: row.x, y: row.y };
      }
      setDrag({ kind: "module", ids, origins, start: raw });
      return;
    }
    const gearHit = gear.find((item) => Math.abs(item.x - raw.x) <= item.widthFt / 2 && Math.abs(item.y - raw.y) <= item.lengthFt / 2);
    if (gearHit && tool === "select") {
      onGestureStart?.();
      onSel({ kind: "obstruction", id: gearHit.id });
      setDrag({ kind: "obstruction", id: gearHit.id, origin: { x: gearHit.x, y: gearHit.y }, start: raw });
      return;
    }
    const face = hitFace(raw);
    onSel(face ? { kind: "face", id: face.id } : null);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const site = toSite(event.clientX, event.clientY, event.currentTarget);

    if (!drag) {
      if (tool === "pan") {
        setHover(null);
        setDraftCursor(null);
        return;
      }
      if (tool === "draw") {
        const from = draft[draft.length - 1];
        setDraftCursor(snapSite(site, { from, shift: event.shiftKey }));
      } else {
        setDraftCursor(null);
      }
      const vertexHit = nearestVertex(faces, site, hitFt);
      if (vertexHit && (tool === "vertex" || tool === "select")) {
        setHover({ kind: "vertex", id: vertexHit.id, index: vertexHit.index });
        setSnapGuide(null);
        return;
      }
      const edgeHit = nearestEdge(faces, site, edgeHitFt);
      if (edgeHit && tool === "select") {
        setHover({ kind: "edge", id: edgeHit.id, index: edgeHit.index });
        setSnapGuide(null);
        return;
      }
      const modHit = hitModule(site);
      if (modHit && (tool === "select" || tool === "panel")) {
        setHover({ kind: "module", id: modHit.id });
        setSnapGuide(null);
        return;
      }
      const gearHit = gear.find((item) => Math.abs(item.x - site.x) <= item.widthFt / 2 && Math.abs(item.y - site.y) <= item.lengthFt / 2);
      if (gearHit && tool === "select") {
        setHover({ kind: "obstruction", id: gearHit.id });
        setSnapGuide(null);
        return;
      }
      const face = hitFace(site);
      setHover(face ? { kind: "face", id: face.id } : null);
      if (tool === "measure" || tool === "panel") {
        refine(site);
      } else if (tool !== "draw") {
        setSnapGuide(null);
      } else {
        const from = draft[draft.length - 1];
        const snapped = snapSite(site, { from, shift: event.shiftKey });
        const moved = Math.hypot(snapped.x - site.x, snapped.y - site.y) > 0.05;
        setSnapGuide(moved ? snapped : null);
      }
      return;
    }

    event.stopPropagation();
    if (drag.kind === "vertex") {
      const face = faces.find((f) => f.id === drag.id);
      const prevPt = face?.points[(drag.index - 1 + (face?.points.length || 1)) % (face?.points.length || 1)];
      const sitePt = refine(site, {
        exclude: { id: drag.id, index: drag.index },
        from: prevPt,
        shift: event.shiftKey,
      });
      onChange({
        ...design,
        faces: faces.map((row) =>
          row.id === drag.id ? { ...row, points: row.points.map((pt, i) => (i === drag.index ? sitePt : pt)) } : row,
        ),
      });
      return;
    }
    if (drag.kind === "module") {
      let dx = site.x - drag.start.x;
      let dy = site.y - drag.start.y;
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      onChange({
        ...design,
        modules: modules.map((mod) => {
          const originPt = drag.origins[mod.id];
          if (!originPt) return mod;
          return { ...mod, x: originPt.x + dx, y: originPt.y + dy };
        }),
      });
      return;
    }
    if (drag.kind === "obstruction") {
      let dx = site.x - drag.start.x;
      let dy = site.y - drag.start.y;
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      onChange({
        ...design,
        obstructions: gear.map((item) => (item.id === drag.id ? { ...item, x: drag.origin.x + dx, y: drag.origin.y + dy } : item)),
      });
    }
  }

  function endDrag() {
    setDrag(null);
    setSnapGuide(null);
  }

  function onDoubleClick() {
    if (tool === "draw" && draft.length >= 3) {
      onGestureStart?.();
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
  const moduleIds = selectedModuleIds();
  const draftPreview = tool === "draw" && draft.length && draftCursor ? draftCursor : null;

  return (
    <svg
      className={`site-svg tool-${tool}${drag ? " is-drag" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={() => {
        setHover(null);
        setSnapGuide(null);
        setDraftCursor(null);
      }}
      onDoubleClick={onDoubleClick}
    >
      {faces.map((face) => {
        const pts = face.points.map(toScreen);
        const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
        const active = selectedFace?.id === face.id;
        const hovered = hover?.kind === "face" && hover.id === face.id && !active;
        const lengths = edgeLengths(face.points);
        const inset = active ? insetTowardCentroid(face.points, setback).map(toScreen) : [];
        return (
          <g key={face.id}>
            <polygon
              points={poly}
              className={`roof-face ${active ? "on" : ""} ${hovered ? "hov" : ""} ${face.eligible === false ? "blocked" : ""}`}
            />
            {active && inset.length >= 3 ? (
              <polygon points={inset.map((p) => `${p.x},${p.y}`).join(" ")} className="roof-setback" />
            ) : null}
            {face.points.map((a, i) => {
              const b = face.points[(i + 1) % face.points.length];
              const mid = toScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
              const kind = classifyEdge(face.points, i, face.azimuthDeg);
              const edgeOn = sel?.kind === "edge" && sel.id === face.id && sel.index === i;
              const edgeHov = hover?.kind === "edge" && hover.id === face.id && hover.index === i;
              const showLabel = active || edgeOn || edgeHov;
              return (
                <g key={`${face.id}-e${i}`}>
                  {edgeOn || edgeHov ? (
                    <line
                      x1={toScreen(a).x}
                      y1={toScreen(a).y}
                      x2={toScreen(b).x}
                      y2={toScreen(b).y}
                      className={edgeOn ? "roof-edge-on" : "roof-edge-hov"}
                    />
                  ) : null}
                  {showLabel ? (
                    <text x={mid.x} y={mid.y} className={`cad-label ${edgeOn ? "" : "dim"}`}>
                      {kind} {formatFeet(lengths[i])}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {face.points.map((pt, i) => {
              const p = toScreen(pt);
              const on = sel?.kind === "vertex" && sel.id === face.id && sel.index === i;
              const hov = hover?.kind === "vertex" && hover.id === face.id && hover.index === i;
              return (
                <circle
                  key={`${face.id}-v${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={on ? 7 : hov ? 6 : active ? 5 : 4}
                  className={`roof-vert ${on ? "on" : ""} ${hov ? "hov" : ""}`}
                />
              );
            })}
            {(active || hovered) && pts[0] ? (
              <text x={pts[0].x} y={pts[0].y - 10} className="cad-label dim">
                {Math.round(polygonArea(face.points))} ft² · {face.pitchDeg}° · {face.azimuthDeg}°
                {face.eligible === false ? " · blocked" : ""}
              </text>
            ) : null}
          </g>
        );
      })}

      {modules.map((mod) => {
        const corners = moduleCorners(mod, design).map(toScreen);
        const on = moduleIds.includes(mod.id);
        const hov = hover?.kind === "module" && hover.id === mod.id && !on;
        return (
          <polygon
            key={mod.id}
            points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
            className={`mod-cell ${on ? "on" : ""} ${hov ? "hov" : ""}`}
          />
        );
      })}

      {gear.map((item) => {
        const a = toScreen({ x: item.x - item.widthFt / 2, y: item.y - item.lengthFt / 2 });
        const b = toScreen({ x: item.x + item.widthFt / 2, y: item.y + item.lengthFt / 2 });
        const on = sel?.kind === "obstruction" && sel.id === item.id;
        const hov = hover?.kind === "obstruction" && hover.id === item.id && !on;
        if (item.kind === "tree") {
          const c = toScreen({ x: item.x, y: item.y });
          const rim = toScreen({ x: item.x + item.widthFt / 2, y: item.y });
          return (
            <circle
              key={item.id}
              cx={c.x}
              cy={c.y}
              r={Math.max(6, Math.abs(rim.x - c.x))}
              className={`obs-tree ${on ? "on" : ""} ${hov ? "hov" : ""}`}
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
            className={`obs-box ${on ? "on" : ""} ${hov ? "hov" : ""}`}
          />
        );
      })}

      {draft.length ? (
        <>
          <polyline
            points={[...draft, ...(draftPreview ? [draftPreview] : [])]
              .map((pt) => {
                const p = toScreen(pt);
                return `${p.x},${p.y}`;
              })
              .join(" ")}
            className="draft-line"
          />
          {draft.map((pt, i) => {
            const p = toScreen(pt);
            return <circle key={`d${i}`} cx={p.x} cy={p.y} r={4} className="roof-vert on" />;
          })}
          {draft.length >= 2
            ? draft.slice(0, -1).map((a, i) => {
                const b = draft[i + 1];
                const mid = toScreen({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                return (
                  <text key={`dl${i}`} x={mid.x} y={mid.y} className="cad-label dim">
                    {formatFeet(Math.hypot(b.x - a.x, b.y - a.y))}
                  </text>
                );
              })
            : null}
        </>
      ) : null}

      {snapGuide ? (
        <circle cx={toScreen(snapGuide).x} cy={toScreen(snapGuide).y} r={8} className="snap-mark" />
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
      {measure.length === 1 ? (
        <circle cx={toScreen(measure[0]).x} cy={toScreen(measure[0]).y} r={4} className="roof-vert on" />
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

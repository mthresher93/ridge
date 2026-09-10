"use client";

import { useState } from "react";
import type { MapView } from "./tile-map";
import { feetPerPixel, projectToScreen, screenToLngLat, siteToLngLat, lngLatToSite } from "@/lib/geo";
import {
  classifyEdge,
  closestOnSegment,
  edgeLengths,
  formatFeet,
  insetPolygon,
  moduleCorners,
  moduleFootprint,
  polygonArea,
  rotatePoints,
  translatePoints,
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

export function selectedModuleIds(sel: CadSel): string[] {
  if (sel?.kind !== "module") return [];
  return sel.ids?.length ? sel.ids : [sel.id];
}

type DragState =
  | { kind: "vertex"; id: string; index: number; origin: Point }
  | { kind: "edge"; id: string; index: number; origin: Point[]; start: Point }
  | { kind: "face"; id: string; origin: Point[]; start: Point; modules: PlacedModule[]; gear: Obstruction[] }
  | { kind: "module"; ids: string[]; origins: Record<string, Point>; start: Point }
  | { kind: "obstruction"; id: string; origin: Point; start: Point };

type Hover =
  | { kind: "vertex"; id: string; index: number }
  | { kind: "edge"; id: string; index: number }
  | { kind: "module"; id: string }
  | { kind: "face"; id: string }
  | { kind: "close" }
  | null;

export function SiteCanvas({
  design,
  view,
  tool,
  sel,
  onSel,
  onChange,
  onWillChange,
  draft,
  onDraft,
  onTool,
}: {
  design: RoofDesign;
  view: MapView;
  tool: CadTool;
  sel: CadSel;
  onSel: (next: CadSel) => void;
  onChange: (next: RoofDesign) => void;
  onWillChange?: () => void;
  draft: Point[];
  onDraft: (next: Point[]) => void;
  onTool?: (next: CadTool) => void;
}) {
  const origin = {
    lat: design.lat || view.lat,
    lng: design.lng || view.lng,
  };
  const fpp = feetPerPixel(origin.lat, view.zoom);
  const hitFt = Math.max(3.5, 9 * fpp);
  const snapFt = Math.max(1.25, 7 * fpp);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pending, setPending] = useState<{ drag: DragState; x: number; y: number } | null>(null);
  const [measure, setMeasure] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [axis, setAxis] = useState(false);

  const faces = design.faces || [];
  const modules = design.modules || [];
  const gear = design.obstructions || [];
  const setback = design.setbackFt ?? 3;
  const selectedMods = selectedModuleIds(sel);

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

  function snapSite(site: Point, skip?: { id: string; index: number }) {
    let best = site;
    let bestD = snapFt;
    for (const face of faces) {
      face.points.forEach((pt, index) => {
        if (skip && skip.id === face.id && skip.index === index) return;
        const d = Math.hypot(pt.x - site.x, pt.y - site.y);
        if (d < bestD) {
          bestD = d;
          best = pt;
        }
      });
    }
    if (draft.length) {
      const first = draft[0];
      const d = Math.hypot(first.x - site.x, first.y - site.y);
      if (d < bestD) best = first;
    }
    return best;
  }

  function constrain(from: Point, to: Point, hold: boolean) {
    if (!hold) return to;
    if (Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)) return { x: to.x, y: from.y };
    return { x: from.x, y: to.y };
  }

  function snapModule(site: Point, face: RoofFace, portrait: boolean) {
    const { w, h } = moduleFootprint(design, portrait);
    let x = site.x - w / 2;
    let y = site.y - h / 2;
    const gap = (design.spacingIn ?? 0.5) / 12;
    for (const mod of modules) {
      if (mod.faceId !== face.id) continue;
      const fp = moduleFootprint(design, mod.portrait !== false);
      if (Math.abs(mod.x - x) < snapFt) x = mod.x;
      if (Math.abs(mod.y - y) < snapFt) y = mod.y;
      if (Math.abs(mod.x + fp.w + gap - x) < snapFt) x = mod.x + fp.w + gap;
      if (Math.abs(mod.y + fp.h + gap - y) < snapFt) y = mod.y + fp.h + gap;
    }
    return { x, y };
  }

  function hoverAt(site: Point): Hover {
    if (tool === "draw" && draft.length >= 3) {
      const first = draft[0];
      if (Math.hypot(first.x - site.x, first.y - site.y) <= snapFt) return { kind: "close" };
    }
    if (tool === "select" || tool === "vertex") {
      const vertexHit = nearestVertex(faces, site, hitFt);
      if (vertexHit) return { kind: "vertex", id: vertexHit.id, index: vertexHit.index };
      const edgeHit = nearestEdge(faces, site, hitFt);
      if (edgeHit) return { kind: "edge", id: edgeHit.id, index: edgeHit.index };
      const modHit = hitModule(site);
      if (modHit) return { kind: "module", id: modHit.id };
      const face = hitFace(site);
      if (face) return { kind: "face", id: face.id };
    }
    if (tool === "panel") {
      const face = hitFace(site);
      if (face) return { kind: "face", id: face.id };
    }
    return null;
  }

  function applyDrag(next: DragState, site: Point, holdAxis: boolean) {
    if (next.kind === "vertex") {
      const raw = constrain(next.origin, site, holdAxis);
      const snapped = snapSite(raw, next);
      onChange({
        ...design,
        faces: faces.map((face) =>
          face.id === next.id ? { ...face, points: face.points.map((pt, i) => (i === next.index ? snapped : pt)) } : face,
        ),
      });
      return;
    }
    if (next.kind === "edge") {
      const raw = constrain(next.start, site, holdAxis);
      const dx = raw.x - next.start.x;
      const dy = raw.y - next.start.y;
      onChange({
        ...design,
        faces: faces.map((face) =>
          face.id === next.id
            ? {
                ...face,
                points: next.origin.map((pt, i) =>
                  i === next.index || i === (next.index + 1) % next.origin.length ? { x: pt.x + dx, y: pt.y + dy } : pt,
                ),
              }
            : face,
        ),
      });
      return;
    }
    if (next.kind === "face") {
      const raw = constrain(next.start, site, holdAxis);
      const dx = raw.x - next.start.x;
      const dy = raw.y - next.start.y;
      onChange({
        ...design,
        faces: faces.map((face) => (face.id === next.id ? { ...face, points: translatePoints(next.origin, dx, dy) } : face)),
        modules: modules.map((mod) => {
          const src = next.modules.find((row) => row.id === mod.id);
          return src ? { ...mod, x: src.x + dx, y: src.y + dy } : mod;
        }),
        obstructions: gear.map((item) => {
          const src = next.gear.find((row) => row.id === item.id);
          return src ? { ...item, x: src.x + dx, y: src.y + dy } : item;
        }),
      });
      return;
    }
    if (next.kind === "module") {
      const raw = constrain(next.start, site, holdAxis);
      const dx = raw.x - next.start.x;
      const dy = raw.y - next.start.y;
      onChange({
        ...design,
        modules: modules.map((mod) => {
          const src = next.origins[mod.id];
          return src ? { ...mod, x: src.x + dx, y: src.y + dy } : mod;
        }),
      });
      return;
    }
    const raw = constrain(next.start, site, holdAxis);
    onChange({
      ...design,
      obstructions: gear.map((item) =>
        item.id === next.id ? { ...item, x: next.origin.x + raw.x - next.start.x, y: next.origin.y + raw.y - next.start.y } : item,
      ),
    });
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (tool === "pan" || event.button === 1) return;
    event.stopPropagation();
    const svg = event.currentTarget;
    const holdAxis = event.shiftKey;
    setAxis(holdAxis);
    const raw = toSite(event.clientX, event.clientY, svg);
    const site = snapSite(raw);

    if (tool === "draw") {
      if (hover?.kind === "close" || (draft.length >= 3 && Math.hypot(draft[0].x - site.x, draft[0].y - site.y) <= snapFt)) {
        closeDraft();
        return;
      }
      const point = draft.length ? constrain(draft[draft.length - 1], site, holdAxis) : site;
      onDraft([...draft, snapSite(point)]);
      onSel(null);
      return;
    }
    if (tool === "measure") {
      setMeasure((prev) => [...prev, site].slice(-2));
      return;
    }
    if (measure.length) setMeasure([]);
    if (tool === "panel") {
      const face = hitFace(raw);
      if (!face || face.eligible === false) return;
      onWillChange?.();
      const { x, y } = snapModule(raw, face, true);
      const mod: PlacedModule = {
        id: uid("mod"),
        faceId: face.id,
        x,
        y,
        rotationDeg: face.azimuthDeg,
        portrait: true,
      };
      onChange({ ...design, modules: [...modules, mod] });
      onSel({ kind: "module", id: mod.id, ids: [mod.id] });
      return;
    }
    if (tool === "gear" || tool === "tree") {
      onWillChange?.();
      const kind: ObstructionKind = tool === "tree" ? "tree" : "vent";
      const item: Obstruction = {
        id: uid("obs"),
        kind,
        x: raw.x,
        y: raw.y,
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
      onSel({ kind: "vertex", id: vertexHit.id, index: vertexHit.index });
      setPending({
        drag: {
          kind: "vertex",
          id: vertexHit.id,
          index: vertexHit.index,
          origin: faces.find((item) => item.id === vertexHit.id)?.points[vertexHit.index] || raw,
        },
        x: event.clientX,
        y: event.clientY,
      });
      svg.setPointerCapture(event.pointerId);
      return;
    }
    const edgeHit = nearestEdge(faces, raw, hitFt);
    if (edgeHit && tool === "select") {
      const face = faces.find((item) => item.id === edgeHit.id);
      onSel({ kind: "edge", id: edgeHit.id, index: edgeHit.index });
      if (face) {
        setPending({
          drag: { kind: "edge", id: edgeHit.id, index: edgeHit.index, origin: face.points, start: raw },
          x: event.clientX,
          y: event.clientY,
        });
        svg.setPointerCapture(event.pointerId);
      }
      return;
    }
    const modHit = hitModule(raw);
    if (modHit && tool === "select") {
      const ids = event.shiftKey
        ? selectedMods.includes(modHit.id)
          ? selectedMods.filter((id) => id !== modHit.id)
          : [...selectedMods, modHit.id]
        : [modHit.id];
      onSel(ids.length ? { kind: "module", id: ids[ids.length - 1], ids } : null);
      const moving = event.shiftKey ? ids : [modHit.id];
      const origins: Record<string, Point> = {};
      for (const mod of modules) {
        if (moving.includes(mod.id)) origins[mod.id] = { x: mod.x, y: mod.y };
      }
      setPending({
        drag: { kind: "module", ids: moving, origins, start: raw },
        x: event.clientX,
        y: event.clientY,
      });
      svg.setPointerCapture(event.pointerId);
      return;
    }
    const gearHit = gear.find((item) => Math.abs(item.x - raw.x) <= item.widthFt / 2 && Math.abs(item.y - raw.y) <= item.lengthFt / 2);
    if (gearHit && tool === "select") {
      onSel({ kind: "obstruction", id: gearHit.id });
      setPending({
        drag: { kind: "obstruction", id: gearHit.id, origin: { x: gearHit.x, y: gearHit.y }, start: raw },
        x: event.clientX,
        y: event.clientY,
      });
      svg.setPointerCapture(event.pointerId);
      return;
    }
    const face = hitFace(raw);
    onSel(face ? { kind: "face", id: face.id } : null);
    if (face && tool === "select") {
      setPending({
        drag: {
          kind: "face",
          id: face.id,
          origin: face.points,
          start: raw,
          modules: modules.filter((mod) => mod.faceId === face.id),
          gear: gear.filter((item) => inside({ x: item.x, y: item.y }, face.points)),
        },
        x: event.clientX,
        y: event.clientY,
      });
      svg.setPointerCapture(event.pointerId);
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const site = toSite(event.clientX, event.clientY, event.currentTarget);
    const holdAxis = event.shiftKey;
    setAxis(holdAxis);
    setCursor(site);
    if (!drag && !pending) setHover(hoverAt(site));

    if (pending && !drag) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 5) return;
      event.stopPropagation();
      onWillChange?.();
      setDrag(pending.drag);
      applyDrag(pending.drag, site, holdAxis);
      setPending(null);
      return;
    }
    if (!drag) return;
    event.stopPropagation();
    applyDrag(drag, site, holdAxis);
  }

  function onPointerUp() {
    setDrag(null);
    setPending(null);
  }

  function closeDraft() {
    if (draft.length < 3) return;
    onWillChange?.();
    const face: RoofFace = {
      id: uid("face"),
      points: draft,
      pitchDeg: design.tiltDeg,
      azimuthDeg: design.azimuthDeg,
      heightFt: 12,
      material: design.roofMaterial,
      eligible: true,
      source: "survey",
    };
    onChange({ ...design, faces: [...faces, face] });
    onDraft([]);
    onSel({ kind: "face", id: face.id });
    onTool?.("select");
  }

  function onDoubleClick(event: React.MouseEvent<SVGSVGElement>) {
    if (tool === "draw" && draft.length >= 3) {
      closeDraft();
      return;
    }
    if (tool === "select" || tool === "vertex") {
      const site = toSite(event.clientX, event.clientY, event.currentTarget);
      const edgeHit = nearestEdge(faces, site, hitFt);
      if (!edgeHit) return;
      const face = faces.find((item) => item.id === edgeHit.id);
      if (!face) return;
      onWillChange?.();
      const a = face.points[edgeHit.index];
      const b = face.points[(edgeHit.index + 1) % face.points.length];
      const { point } = closestOnSegment(site, a, b);
      const points = [...face.points.slice(0, edgeHit.index + 1), point, ...face.points.slice(edgeHit.index + 1)];
      onChange({
        ...design,
        faces: faces.map((item) => (item.id === face.id ? { ...item, points, source: "survey" } : item)),
      });
      onSel({ kind: "vertex", id: face.id, index: edgeHit.index + 1 });
    }
  }

  const measureLive =
    measure.length === 1 && cursor
      ? Math.hypot(cursor.x - measure[0].x, cursor.y - measure[0].y)
      : measure.length === 2
        ? Math.hypot(measure[1].x - measure[0].x, measure[1].y - measure[0].y)
        : 0;

  const selectedFace = sel?.kind === "face" || sel?.kind === "vertex" || sel?.kind === "edge" ? faces.find((f) => f.id === sel.id) : null;
  const ghostFace = tool === "panel" && cursor ? hitFace(cursor) : null;
  const ghost =
    ghostFace && ghostFace.eligible !== false && cursor
      ? { face: ghostFace, ...snapModule(cursor, ghostFace, true), ...moduleFootprint(design, true) }
      : null;

  const draftCursor =
    tool === "draw" && draft.length && cursor
      ? hover?.kind === "close"
        ? draft[0]
        : axis
          ? constrain(draft[draft.length - 1], cursor, true)
          : snapSite(cursor)
      : null;

  return (
    <svg
      className={`site-svg tool-${tool}`}
      data-origin={`${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`}
      data-view={`${view.lat.toFixed(5)},${view.lng.toFixed(5)},${view.zoom.toFixed(2)}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        setHover(null);
        setCursor(null);
      }}
      onDoubleClick={onDoubleClick}
    >
      {faces.map((face) => {
        const pts = face.points.map(toScreen);
        const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");
        const active = selectedFace?.id === face.id;
        const hot = hover?.kind === "face" && hover.id === face.id;
        const lengths = edgeLengths(face.points);
        const inset = active ? insetPolygon(face.points, setback).map(toScreen) : [];
        const showVerts = active || (hover && "id" in hover && hover.id === face.id);
        return (
          <g key={face.id}>
            <polygon
              points={poly}
              className={`roof-face ${active ? "on" : ""} ${hot && !active ? "hot" : ""} ${face.eligible === false ? "blocked" : ""}`}
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
                  const edgeHot = hover?.kind === "edge" && hover.id === face.id && hover.index === i;
                  return (
                    <g key={`${face.id}-e${i}`}>
                      {edgeOn || edgeHot ? (
                        <line
                          x1={toScreen(a).x}
                          y1={toScreen(a).y}
                          x2={toScreen(b).x}
                          y2={toScreen(b).y}
                          className={edgeOn ? "roof-edge-on" : "roof-edge-hot"}
                        />
                      ) : null}
                      <text x={mid.x} y={mid.y - 6} className="cad-label">
                        {kind} {formatFeet(lengths[i])}
                      </text>
                    </g>
                  );
                })
              : null}
            {showVerts
              ? face.points.map((pt, i) => {
                  const p = toScreen(pt);
                  const on = sel?.kind === "vertex" && sel.id === face.id && sel.index === i;
                  const hotVert = hover?.kind === "vertex" && hover.id === face.id && hover.index === i;
                  return (
                    <circle
                      key={`${face.id}-v${i}`}
                      cx={p.x}
                      cy={p.y}
                      r={on ? 7 : hotVert ? 6 : 4.5}
                      className={`roof-vert ${on ? "on" : ""} ${hotVert && !on ? "hot" : ""}`}
                    />
                  );
                })
              : null}
            <text x={pts[0]?.x || 0} y={(pts[0]?.y || 0) - 10} className="cad-label dim">
              {Math.round(polygonArea(face.points))} ft² · {face.pitchDeg}° · {face.azimuthDeg}°
              {face.eligible === false ? " · blocked" : ""}
            </text>
          </g>
        );
      })}

      {modules.map((mod) => {
        const corners = moduleCorners(mod, design).map(toScreen);
        const on = selectedMods.includes(mod.id);
        const hot = hover?.kind === "module" && hover.id === mod.id;
        return (
          <polygon
            key={mod.id}
            points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
            className={`mod-cell ${on ? "on" : ""} ${hot && !on ? "hot" : ""}`}
          />
        );
      })}

      {ghost ? (
        <rect
          className="mod-ghost"
          x={toScreen({ x: ghost.x, y: ghost.y }).x}
          y={toScreen({ x: ghost.x, y: ghost.y }).y}
          width={Math.abs(toScreen({ x: ghost.x + ghost.w, y: ghost.y }).x - toScreen({ x: ghost.x, y: ghost.y }).x)}
          height={Math.abs(toScreen({ x: ghost.x, y: ghost.y + ghost.h }).y - toScreen({ x: ghost.x, y: ghost.y }).y)}
        />
      ) : null}

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
          points={[...draft, ...(draftCursor ? [draftCursor] : [])]
            .map((pt) => {
              const p = toScreen(pt);
              return `${p.x},${p.y}`;
            })
            .join(" ")}
          className="draft-line"
        />
      ) : null}
      {draft.map((pt, i) => {
        const p = toScreen(pt);
        return <circle key={`d${i}`} cx={p.x} cy={p.y} r={i === 0 && hover?.kind === "close" ? 7 : 4} className={`roof-vert ${i === 0 && hover?.kind === "close" ? "on" : ""}`} />;
      })}
      {draft.length && draftCursor ? (
        <text x={toScreen(draftCursor).x + 8} y={toScreen(draftCursor).y - 8} className="cad-label">
          {formatFeet(Math.hypot(draftCursor.x - draft[draft.length - 1].x, draftCursor.y - draft[draft.length - 1].y))}
          {hover?.kind === "close" ? " · close" : ""}
        </text>
      ) : null}

      {measure.length === 1 && cursor ? (
        <>
          <line
            x1={toScreen(measure[0]).x}
            y1={toScreen(measure[0]).y}
            x2={toScreen(cursor).x}
            y2={toScreen(cursor).y}
            className="measure-line"
          />
          <text x={toScreen(cursor).x + 8} y={toScreen(cursor).y - 8} className="cad-label">
            {formatFeet(measureLive)}
          </text>
        </>
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
            {formatFeet(measureLive)}
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

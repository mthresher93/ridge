"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { lngLatToWorld, screenToLngLat, tileUrl, worldToLngLat } from "@/lib/geo";

const TILE = 256;

export type MapKind = "satellite" | "streets";

export type MapView = {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
};

export function TileMap({
  lat,
  lng,
  zoom,
  kind,
  onMove,
  children,
  className,
}: {
  lat: number;
  lng: number;
  zoom: number;
  kind: MapKind;
  onMove: (next: { lat: number; lng: number; zoom: number }) => void;
  children?: (view: MapView) => ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const drag = useRef<{ x: number; y: number; lat: number; lng: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const view: MapView = { lat, lng, zoom, width: size.width, height: size.height };
  const latest = useRef({ view, onMove });
  latest.current = { view, onMove };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { view: current, onMove: move } = latest.current;
      const nextZoom = Math.max(4, Math.min(19, current.zoom + (event.deltaY > 0 ? -0.35 : 0.35)));
      const rect = el.getBoundingClientRect();
      const local = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const before = screenToLngLat(local.x, local.y, current);
      const after = screenToLngLat(local.x, local.y, { ...current, zoom: nextZoom });
      move({
        zoom: nextZoom,
        lng: current.lng + (before.lng - after.lng),
        lat: current.lat + (before.lat - after.lat),
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const z = Math.max(3, Math.min(19, Math.round(zoom)));
  const n = 2 ** z;
  const scale = TILE * n;
  const center = lngLatToWorld(lng, lat);
  const originX = center.x * scale - size.width / 2;
  const originY = center.y * scale - size.height / 2;
  const x0 = Math.floor(originX / TILE);
  const y0 = Math.floor(originY / TILE);
  const x1 = Math.floor((originX + size.width) / TILE);
  const y1 = Math.floor((originY + size.height) / TILE);
  const tiles: { key: string; left: number; top: number; src: string }[] = [];
  for (let y = y0; y <= y1; y += 1) {
    if (y < 0 || y >= n) continue;
    for (let x = x0; x <= x1; x += 1) {
      const tx = ((x % n) + n) % n;
      tiles.push({
        key: `${z}:${tx}:${y}`,
        left: x * TILE - originX,
        top: y * TILE - originY,
        src: tileUrl(kind, z, tx, y),
      });
    }
  }

  function panBy(dx: number, dy: number, from = { lat, lng }) {
    const world = lngLatToWorld(from.lng, from.lat);
    const next = worldToLngLat(world.x - dx / scale, world.y - dy / scale);
    onMove({ lat: next.lat, lng: next.lng, zoom });
  }

  return (
    <div
      ref={ref}
      className={`tile-map ${className || ""}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, lat, lng };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        panBy(event.clientX - drag.current.x, event.clientY - drag.current.y, drag.current);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      {tiles.map((tile) => (
        <img key={tile.key} alt="" draggable={false} src={tile.src} className="tile-map-img" style={{ left: tile.left, top: tile.top }} />
      ))}
      <div className="tile-map-overlay">{children?.(view)}</div>
      <div className="tile-map-attr">
        {kind === "satellite" ? "Imagery © Esri" : "© OpenStreetMap"}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { coordsFor } from "@/lib/geo";
import { leadEligibility, money, phonePretty } from "@/lib/format";
import { estimateFor } from "@/lib/solar";
import { TileMap, type MapKind } from "./tile-map";
import { projectToScreen } from "@/lib/geo";
import type { Lead } from "@/lib/types";

type Filter = "all" | "callable" | "appointments" | "proposals" | "dnc";

function pinTone(lead: Lead) {
  if (lead.dnc) return "dnc";
  if (/Appointment/.test(lead.status)) return "sit";
  if (/Proposal|Contract|PTO/.test(lead.status)) return "paper";
  if (/Qualified/.test(lead.status)) return "ok";
  if (/Lost/.test(lead.status)) return "lost";
  return "lead";
}

function loc(lead: Lead, designs: Record<string, { lat?: number; lng?: number }>) {
  const design = designs[lead.id];
  if (design?.lat != null && design.lng != null) return { lat: design.lat, lng: design.lng };
  return coordsFor(lead.city, lead.id);
}

export function MapView() {
  const router = useRouter();
  const { workspace, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<MapKind>("streets");
  const [zoom, setZoom] = useState(7.2);
  const [center, setCenter] = useState({ lat: 35.5, lng: -118.4 });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.leads.filter((lead) => {
      if (filter === "callable" && leadEligibility(lead).tone !== "ok") return false;
      if (filter === "appointments" && !/Appointment/.test(lead.status)) return false;
      if (filter === "proposals" && !/Proposal|Contract|Design/.test(lead.status)) return false;
      if (filter === "dnc" && !lead.dnc) return false;
      if (q && ![lead.name, lead.property, lead.city, lead.status, lead.utility].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [workspace.leads, query, filter]);

  const selected = workspace.leads.find((lead) => lead.id === selectedLeadId) || null;
  const selectedLoc = selected ? loc(selected, workspace.designs) : null;

  function fit() {
    if (!rows.length) return;
    const points = rows.map((lead) => loc(lead, workspace.designs));
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
    const span = Math.max(
      Math.max(...points.map((p) => p.lat)) - Math.min(...points.map((p) => p.lat)),
      Math.max(...points.map((p) => p.lng)) - Math.min(...points.map((p) => p.lng)),
    );
    setCenter({ lat, lng });
    setZoom(span < 0.08 ? 12 : span < 0.4 ? 10 : span < 1.2 ? 8 : 6.5);
  }

  if (loading) return <div className="text-[var(--muted)]">Loading map…</div>;

  return (
    <div className="map-desk">
      <header className="map-top">
        <input className="az-input map-search" placeholder="Search people, city, status" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="map-filters">
          {([
            ["all", "All"],
            ["callable", "Callable"],
            ["appointments", "Appointments"],
            ["proposals", "Proposals"],
            ["dnc", "DNC"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="az-btn" onClick={fit}>
          Fit results
        </button>
        <button type="button" className="az-btn" onClick={() => setKind((k) => (k === "streets" ? "satellite" : "streets"))}>
          {kind === "streets" ? "Streets" : "Satellite"}
        </button>
        <span className="az-num text-[12px] text-[var(--muted)]">{rows.length}</span>
      </header>

      <div className="map-body">
        <TileMap lat={center.lat} lng={center.lng} zoom={zoom} kind={kind} onMove={(next) => { setCenter({ lat: next.lat, lng: next.lng }); setZoom(next.zoom); }}>
          {(view) => {
            const cell = zoom >= 11 ? 0 : zoom >= 9 ? 0.12 : 0.28;
            const groups = new Map<string, { leads: Lead[]; lat: number; lng: number }>();
            for (const lead of rows) {
              const p = loc(lead, workspace.designs);
              const key = cell ? `${Math.round(p.lat / cell)}:${Math.round(p.lng / cell)}` : lead.id;
              const cur = groups.get(key) || { leads: [], lat: p.lat, lng: p.lng };
              cur.leads.push(lead);
              cur.lat = (cur.lat * (cur.leads.length - 1) + p.lat) / cur.leads.length;
              cur.lng = (cur.lng * (cur.leads.length - 1) + p.lng) / cur.leads.length;
              groups.set(key, cur);
            }
            return (
              <svg className="map-pins">
                {Array.from(groups.values()).map((group) => {
                  const s = projectToScreen(group.lng, group.lat, view);
                  if (group.leads.length > 1 && cell) {
                    return (
                      <g
                        key={`${group.lat}:${group.lng}`}
                        className="map-cluster"
                        transform={`translate(${s.x} ${s.y})`}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setCenter({ lat: group.lat, lng: group.lng });
                          setZoom((z) => Math.min(14, z + 2));
                        }}
                      >
                        <circle r="16" />
                        <text textAnchor="middle" dy="4">
                          {group.leads.length}
                        </text>
                      </g>
                    );
                  }
                  const lead = group.leads[0];
                  const on = selectedLeadId === lead.id;
                  return (
                    <g
                      key={lead.id}
                      className={`map-pin ${pinTone(lead)} ${on ? "on" : ""}`}
                      transform={`translate(${s.x} ${s.y})`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelectedLeadId(lead.id);
                      }}
                    >
                      <circle r={on ? 8 : 6} />
                    </g>
                  );
                })}
              </svg>
            );
          }}
        </TileMap>

        <aside className="map-side">
          {selected && selectedLoc ? (
            <div className="map-card">
              <div className="az-kicker">{selected.status}</div>
              <h2>{selected.name}</h2>
              <p>{selected.property}</p>
              <p className="text-[12px] text-[var(--muted)]">
                {selected.city} · {selected.utility} · {selected.monthlyBill ? money(selected.monthlyBill) + "/mo" : "no bill"}
              </p>
              <p className="az-num text-[13px] mt-2">{phonePretty(selected.phone)}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" className="az-btn pri" onClick={() => router.push("/floor")}>
                  Dialer
                </button>
                <button type="button" className="az-btn" onClick={() => router.push("/design")}>
                  Design
                </button>
                <button type="button" className="az-btn" onClick={() => router.push("/people")}>
                  Record
                </button>
              </div>
              {workspace.designs[selected.id] ? (
                <p className="cad-note mt-3">
                  {estimateFor(selected, workspace.designs[selected.id]).systemKw} kW planning size
                </p>
              ) : null}
            </div>
          ) : (
            <div className="map-card">
              <div className="az-kicker">Map</div>
              <p className="text-[13px] text-[var(--muted)]">Select a pin. Pins are lead locations from city coordinates — not surveyed rooftops.</p>
            </div>
          )}
          <div className="map-list">
            {rows.map((lead) => (
              <button
                key={lead.id}
                type="button"
                className={`map-list-row ${selected?.id === lead.id ? "on" : ""}`}
                onClick={() => {
                  setSelectedLeadId(lead.id);
                  const p = loc(lead, workspace.designs);
                  setCenter(p);
                  setZoom(14);
                }}
              >
                <b>{lead.name}</b>
                <span>{lead.city}</span>
              </button>
            ))}
          </div>
          <div className="map-legend">
            <i className="lead" /> Lead
            <i className="ok" /> Qualified
            <i className="sit" /> Appointment
            <i className="paper" /> Proposal
            <i className="dnc" /> DNC
          </div>
        </aside>
      </div>
    </div>
  );
}

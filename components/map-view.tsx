"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { coordsFor, projectToScreen, screenToLngLat } from "@/lib/geo";
import { leadEligibility, money, moneyShort, nowIso, phonePretty, relativeDue } from "@/lib/format";
import { estimateFor } from "@/lib/solar";
import { TileMap, type MapKind } from "./tile-map";
import type { Lead } from "@/lib/types";

type Filter = "all" | "callable" | "appointments" | "proposals" | "pinned" | "dnc";
type MapViewBox = { lng: number; lat: number; zoom: number; width: number; height: number };

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
  if (design?.lat != null && design.lng != null) return { lat: design.lat, lng: design.lng, pinned: true as const };
  const city = coordsFor(lead.city, lead.id);
  return { lat: city.lat, lng: city.lng, pinned: false as const };
}

function isPinned(lead: Lead, designs: Record<string, { lat?: number; lng?: number }>) {
  const design = designs[lead.id];
  return design?.lat != null && design.lng != null;
}

export function MapView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [city, setCity] = useState("all");
  const [kind, setKind] = useState<MapKind>("streets");
  const [zoom, setZoom] = useState(7.2);
  const [center, setCenter] = useState({ lat: 35.5, lng: -118.4 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRef = useRef<MapViewBox | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const didFit = useRef(false);

  const cities = useMemo(() => {
    return Array.from(new Set(workspace.leads.map((lead) => lead.city).filter(Boolean))).sort();
  }, [workspace.leads]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.leads
      .filter((lead) => {
        if (city !== "all" && lead.city !== city) return false;
        if (filter === "callable" && leadEligibility(lead).tone !== "ok") return false;
        if (filter === "appointments" && !/Appointment/.test(lead.status)) return false;
        if (filter === "proposals" && !/Proposal|Contract|Design/.test(lead.status)) return false;
        if (filter === "pinned" && !isPinned(lead, workspace.designs)) return false;
        if (filter === "dnc" && !lead.dnc) return false;
        if (
          q &&
          ![lead.name, lead.property, lead.city, lead.status, lead.utility, lead.owner, lead.nextAction]
            .join(" ")
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  }, [workspace.leads, workspace.designs, query, filter, city]);

  const counts = useMemo(() => {
    const all = workspace.leads;
    return {
      all: all.length,
      callable: all.filter((lead) => leadEligibility(lead).tone === "ok").length,
      appointments: all.filter((lead) => /Appointment/.test(lead.status)).length,
      proposals: all.filter((lead) => /Proposal|Contract|Design/.test(lead.status)).length,
      pinned: all.filter((lead) => isPinned(lead, workspace.designs)).length,
      dnc: all.filter((lead) => lead.dnc).length,
    };
  }, [workspace.leads, workspace.designs]);

  const selected = rows.find((lead) => lead.id === selectedLeadId) || workspace.leads.find((lead) => lead.id === selectedLeadId) || null;
  const selectedLoc = selected ? loc(selected, workspace.designs) : null;
  const selectedOpp = selected ? workspace.opportunities.find((item) => item.leadId === selected.id) : null;
  const selectedCallback = selected
    ? workspace.callbacks.find((item) => item.leadId === selected.id && item.status === "open")
    : null;
  const selectedDesign = selected ? workspace.designs[selected.id] : null;
  const selectedEstimate = selected && selectedDesign ? estimateFor(selected, selectedDesign) : null;
  const eligibility = selected ? leadEligibility(selected) : null;
  const cityCount = useMemo(() => new Set(rows.map((lead) => lead.city)).size, [rows]);

  function fit(points = rows.map((lead) => loc(lead, workspace.designs))) {
    if (!points.length) return;
    const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
    const lng = points.reduce((sum, point) => sum + point.lng, 0) / points.length;
    const span = Math.max(
      Math.max(...points.map((point) => point.lat)) - Math.min(...points.map((point) => point.lat)),
      Math.max(...points.map((point) => point.lng)) - Math.min(...points.map((point) => point.lng)),
      0.02,
    );
    setCenter({ lat, lng });
    setZoom(span < 0.08 ? 12.5 : span < 0.35 ? 10.2 : span < 1.1 ? 8.2 : span < 3 ? 6.8 : 5.8);
  }

  function selectLead(leadId: string, focus = true) {
    setSelectedLeadId(leadId);
    if (!focus) return;
    const lead = workspace.leads.find((item) => item.id === leadId);
    if (!lead) return;
    const point = loc(lead, workspace.designs);
    setCenter({ lat: point.lat, lng: point.lng });
    setZoom((current) => Math.max(current, 12.5));
  }

  function setPin(leadId: string, lat: number, lng: number) {
    setWorkspace((prev) => {
      const design = prev.designs[leadId];
      if (!design) return prev;
      return {
        ...prev,
        designs: {
          ...prev.designs,
          [leadId]: { ...design, lat, lng, updatedAt: nowIso() },
        },
        updatedAt: nowIso(),
      };
    });
  }

  useEffect(() => {
    if (!draggingId) return;
    const onMove = (event: PointerEvent) => {
      const el = svgRef.current;
      const view = viewRef.current;
      if (!el || !view) return;
      const rect = el.getBoundingClientRect();
      const next = screenToLngLat(event.clientX - rect.left, event.clientY - rect.top, view);
      setPin(draggingId, next.lat, next.lng);
    };
    const onUp = () => {
      log("lead", draggingId, "pin_set", "Pin relocated on map");
      setDraggingId(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingId]);

  useEffect(() => {
    if (loading) return;
    if (!didFit.current && rows.length) {
      fit();
      didFit.current = true;
    }
  }, [loading, rows.length]);

  useEffect(() => {
    if (loading || !didFit.current || !rows.length) return;
    fit();
  }, [filter, city]);

  useEffect(() => {
    if (!selectedLeadId || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(`[data-lead="${selectedLeadId}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [selectedLeadId, rows]);

  if (loading) {
    return (
      <div className="map-desk map-loading">
        <div className="map-empty-state">Loading map workspace…</div>
      </div>
    );
  }

  return (
    <div className="map-desk">
      <header className="map-top">
        <div className="map-top-main">
          <input
            className="az-input map-search"
            placeholder="Search contacts, city, owner, status"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="az-select map-city"
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
            }}
            aria-label="City territory"
          >
            <option value="all">All cities</option>
            {cities.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <div className="map-filters" role="tablist" aria-label="Map filters">
            {(
              [
                ["all", "All", counts.all],
                ["callable", "Callable", counts.callable],
                ["appointments", "Sits", counts.appointments],
                ["proposals", "Paper", counts.proposals],
                ["pinned", "Pinned", counts.pinned],
                ["dnc", "DNC", counts.dnc],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                className={filter === id ? "on" : ""}
                onClick={() => {
                  setFilter(id);
                }}
              >
                {label}
                <em>{count}</em>
              </button>
            ))}
          </div>
        </div>
        <div className="map-top-actions">
          <span className="map-result-meta az-num">
            {rows.length} · {cityCount} {cityCount === 1 ? "city" : "cities"}
          </span>
          <button
            type="button"
            className="az-btn"
            onClick={() => fit()}
            disabled={!rows.length}
          >
            Fit results
          </button>
          <button type="button" className="az-btn" onClick={() => setKind((value) => (value === "streets" ? "satellite" : "streets"))}>
            {kind === "streets" ? "Streets" : "Satellite"}
          </button>
        </div>
      </header>

      <div className="map-body">
        <div className="map-canvas-wrap">
          <TileMap
            lat={center.lat}
            lng={center.lng}
            zoom={zoom}
            kind={kind}
            onMove={(next) => {
              setCenter({ lat: next.lat, lng: next.lng });
              setZoom(next.zoom);
            }}
          >
            {(view) => {
              const cell = zoom >= 11.5 ? 0 : zoom >= 9.2 ? 0.1 : 0.26;
              const groups = new Map<string, { leads: Lead[]; lat: number; lng: number }>();
              for (const lead of rows) {
                const point = loc(lead, workspace.designs);
                const key = cell ? `${Math.round(point.lat / cell)}:${Math.round(point.lng / cell)}` : lead.id;
                const cur = groups.get(key) || { leads: [], lat: point.lat, lng: point.lng };
                cur.leads.push(lead);
                cur.lat = (cur.lat * (cur.leads.length - 1) + point.lat) / cur.leads.length;
                cur.lng = (cur.lng * (cur.leads.length - 1) + point.lng) / cur.leads.length;
                groups.set(key, cur);
              }
              return (
                <svg
                  className="map-pins"
                  ref={(el) => {
                    svgRef.current = el;
                    viewRef.current = view;
                  }}
                >
                  {Array.from(groups.values()).map((group) => {
                    const screen = projectToScreen(group.lng, group.lat, view);
                    if (group.leads.length > 1 && cell) {
                      const active = group.leads.some((lead) => lead.id === selectedLeadId || lead.id === hoverId);
                      return (
                        <g
                          key={`${group.lat}:${group.lng}`}
                          className={`map-cluster ${active ? "on" : ""}`}
                          transform={`translate(${screen.x} ${screen.y})`}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setCenter({ lat: group.lat, lng: group.lng });
                            setZoom((value) => Math.min(14.5, value + 2.2));
                            if (group.leads[0]) setSelectedLeadId(group.leads[0].id);
                          }}
                          onPointerEnter={() => setHoverId(group.leads[0]?.id || null)}
                          onPointerLeave={() => setHoverId(null)}
                        >
                          <circle r={Math.min(22, 12 + group.leads.length)} />
                          <text textAnchor="middle" dy="4">
                            {group.leads.length}
                          </text>
                        </g>
                      );
                    }
                    const lead = group.leads[0];
                    const point = loc(lead, workspace.designs);
                    const on = selectedLeadId === lead.id;
                    const hover = hoverId === lead.id;
                    return (
                      <g
                        key={lead.id}
                        className={`map-pin ${pinTone(lead)} ${point.pinned ? "pinned" : "estimate"} ${on ? "on" : ""} ${hover ? "hover" : ""} ${draggingId === lead.id ? "dragging" : ""}`}
                        transform={`translate(${screen.x} ${screen.y})`}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelectedLeadId(lead.id);
                          if (event.shiftKey || zoom >= 12) setDraggingId(lead.id);
                        }}
                        onPointerEnter={() => setHoverId(lead.id)}
                        onPointerLeave={() => setHoverId(null)}
                      >
                        <circle className="map-pin-halo" r={on || hover ? 14 : 10} />
                        <circle className="map-pin-dot" r={on ? 7 : 5.5} />
                        {!point.pinned ? <circle className="map-pin-ring" r={9} /> : null}
                      </g>
                    );
                  })}
                </svg>
              );
            }}
          </TileMap>
          {!rows.length ? (
            <div className="map-canvas-empty">
              <p>No contacts match these filters.</p>
              <button
                type="button"
                className="az-btn"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                  setCity("all");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>

        <aside className="map-side">
          {selected && selectedLoc ? (
            <div className="map-inspect">
              <div className="map-inspect-head">
                <div className="map-inspect-status">
                  <span className={`map-tone ${pinTone(selected)}`} />
                  <span className="az-kicker">{selected.status}</span>
                  <span className="map-inspect-city">{selected.city}</span>
                </div>
                <button type="button" className="map-inspect-clear" onClick={() => setSelectedLeadId(null)} aria-label="Clear selection">
                  ×
                </button>
              </div>
              <h2>{selected.name}</h2>
              <p className="map-inspect-property">{selected.property || "Property unset"}</p>
              <div className="map-inspect-grid">
                <div>
                  <span>Phone</span>
                  <b className="az-num">{phonePretty(selected.phone)}</b>
                </div>
                <div>
                  <span>Consent</span>
                  <b>{eligibility?.label || "—"}</b>
                </div>
                <div>
                  <span>Utility</span>
                  <b>
                    {selected.utility || "—"}
                    {selected.monthlyBill ? ` · ${money(selected.monthlyBill)}` : ""}
                  </b>
                </div>
                <div>
                  <span>Owner</span>
                  <b>{selected.owner || "—"}</b>
                </div>
                <div className="span">
                  <span>Next</span>
                  <b>{selected.nextAction || "—"}</b>
                </div>
                {selectedCallback ? (
                  <div className="span">
                    <span>Follow-up</span>
                    <b className={Date.parse(selectedCallback.dueAt) < Date.now() ? "late" : ""}>
                      {relativeDue(selectedCallback.dueAt)} · {selectedCallback.reason}
                    </b>
                  </div>
                ) : null}
                {selectedOpp ? (
                  <div>
                    <span>Deal</span>
                    <b className="az-num">{moneyShort(selectedOpp.value)}</b>
                  </div>
                ) : (
                  <div>
                    <span>Est. value</span>
                    <b className="az-num">{selected.estimatedValue ? moneyShort(selected.estimatedValue) : "—"}</b>
                  </div>
                )}
                <div>
                  <span>Design</span>
                  <b className="az-num">
                    {selectedEstimate ? `${selectedEstimate.systemKw} kW` : "Unsized"}
                    {selectedDesign?.modules?.length ? ` · ${selectedDesign.modules.length} mod` : ""}
                  </b>
                </div>
                <div className="span">
                  <span>Location</span>
                  <b>
                    {selectedLoc.pinned ? "Pinned site" : "City estimate"} · {selectedLoc.lat.toFixed(4)}, {selectedLoc.lng.toFixed(4)}
                  </b>
                </div>
              </div>
              <p className="map-inspect-hint">Shift-drag pin (or drag at zoom 12+) to set surveyed site for Design.</p>
              <div className="map-inspect-actions">
                <button type="button" className="az-btn pri" onClick={() => router.push("/floor")}>
                  Dialer
                </button>
                <button type="button" className="az-btn" onClick={() => router.push("/design")}>
                  Design
                </button>
                <button type="button" className="az-btn" onClick={() => router.push(`/people?id=${selected.id}`)}>
                  Record
                </button>
                <button
                  type="button"
                  className="az-btn ghost"
                  onClick={() => {
                    setPin(selected.id, center.lat, center.lng);
                    log("lead", selected.id, "pin_set", `Pin set to map center ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
                  }}
                >
                  Pin center
                </button>
              </div>
            </div>
          ) : (
            <div className="map-inspect map-inspect-empty">
              <div className="az-kicker">Workspace</div>
              <p>Select a pin or list row. Inspector stays compact so the map stays usable.</p>
            </div>
          )}

          <div className="map-list-head">
            <span>Contacts</span>
            <span className="az-num">{rows.length}</span>
          </div>
          <div className="map-list" ref={listRef}>
            {rows.length === 0 ? (
              <div className="map-list-empty">No contacts in this view.</div>
            ) : null}
            {rows.map((lead) => {
              const point = loc(lead, workspace.designs);
              const tone = pinTone(lead);
              const callback = workspace.callbacks.find((item) => item.leadId === lead.id && item.status === "open");
              return (
                <button
                  key={lead.id}
                  type="button"
                  data-lead={lead.id}
                  className={`map-list-row ${selected?.id === lead.id ? "on" : ""} ${hoverId === lead.id ? "hover" : ""}`}
                  onClick={() => selectLead(lead.id)}
                  onMouseEnter={() => setHoverId(lead.id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <span className={`map-tone ${tone}`} />
                  <span className="map-list-copy">
                    <b>{lead.name}</b>
                    <i>
                      {lead.status}
                      {callback ? ` · ${relativeDue(callback.dueAt)}` : ""}
                    </i>
                  </span>
                  <span className="map-list-meta">
                    <em>{lead.city}</em>
                    <em className={point.pinned ? "pin" : "est"}>{point.pinned ? "pin" : "est"}</em>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="map-legend">
            <i className="lead" /> Lead
            <i className="ok" /> Qualified
            <i className="sit" /> Sit
            <i className="paper" /> Paper
            <i className="dnc" /> DNC
            <span className="map-legend-note">Hollow = city estimate</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

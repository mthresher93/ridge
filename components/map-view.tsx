"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { coordsFor, projectToScreen, screenToLngLat } from "@/lib/geo";
import { leadEligibility, money, moneyShort, nowIso, phonePretty, relativeDue } from "@/lib/format";
import { estimateFor } from "@/lib/solar";
import { TileMap, type MapKind } from "./tile-map";
import type { Lead, RoofDesign } from "@/lib/types";

type Filter = "all" | "callable" | "appointments" | "proposals" | "pinned" | "dnc";
type MapViewBox = { lng: number; lat: number; zoom: number; width: number; height: number };
type Loc = { lat: number; lng: number; pinned: boolean };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "callable", label: "Callable" },
  { id: "appointments", label: "Appointments" },
  { id: "proposals", label: "Proposal" },
  { id: "pinned", label: "Site pin" },
  { id: "dnc", label: "DNC" },
];

function pinTone(lead: Lead) {
  if (lead.dnc) return "dnc";
  if (/Lost/.test(lead.status)) return "lost";
  if (/Appointment/.test(lead.status)) return "sit";
  if (/Proposal|Contract|Design|PTO/.test(lead.status)) return "paper";
  if (/Qualified/.test(lead.status)) return "ok";
  return "lead";
}

function cityEstimate(lead: Lead) {
  return coordsFor(lead.city, lead.id);
}

function loc(lead: Lead, designs: Record<string, RoofDesign | undefined>): Loc {
  const design = designs[lead.id];
  const estimate = cityEstimate(lead);
  if (design?.lat == null || design.lng == null) return { ...estimate, pinned: false };
  const moved = Math.abs(design.lat - estimate.lat) > 0.00025 || Math.abs(design.lng - estimate.lng) > 0.00025;
  return { lat: design.lat, lng: design.lng, pinned: moved };
}

function isSitePin(lead: Lead, designs: Record<string, RoofDesign | undefined>) {
  return loc(lead, designs).pinned;
}

function designSummary(lead: Lead, design?: RoofDesign) {
  if (!design) return null;
  const modules = design.modules?.length || 0;
  const faces = design.faces?.length || 0;
  const estimate = estimateFor(lead, design);
  if (modules) return `${estimate.systemKw} kW · ${modules} modules`;
  if (faces) return `${faces} roof face${faces === 1 ? "" : "s"} · no modules`;
  return `${estimate.systemKw} kW bill-plan`;
}

export function MapView() {
  const router = useRouter();
  const { workspace, setWorkspace, log, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [city, setCity] = useState("all");
  const [owner, setOwner] = useState("all");
  const [kind, setKind] = useState<MapKind>("streets");
  const [zoom, setZoom] = useState(7.2);
  const [center, setCenter] = useState({ lat: 35.5, lng: -118.4 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverGroup, setHoverGroup] = useState<string[] | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRef = useRef<MapViewBox | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const didFit = useRef(false);

  const cities = useMemo(() => {
    return Array.from(new Set(workspace.leads.map((lead) => lead.city).filter(Boolean))).sort();
  }, [workspace.leads]);

  const owners = useMemo(() => {
    return Array.from(new Set(workspace.leads.map((lead) => lead.owner).filter(Boolean))).sort();
  }, [workspace.leads]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.leads
      .filter((lead) => {
        if (lead.archivedAt) return false;
        if (city !== "all" && lead.city !== city) return false;
        if (owner !== "all" && lead.owner !== owner) return false;
        if (filter === "callable" && leadEligibility(lead).tone !== "ok") return false;
        if (filter === "appointments" && !/Appointment/.test(lead.status)) return false;
        if (filter === "proposals" && !/Proposal|Contract|Design|PTO/.test(lead.status)) return false;
        if (filter === "pinned" && !isSitePin(lead, workspace.designs)) return false;
        if (filter === "dnc" && !lead.dnc) return false;
        if (
          q &&
          ![lead.name, lead.property, lead.city, lead.status, lead.utility, lead.owner, lead.nextAction, lead.address]
            .join(" ")
            .toLowerCase()
            .includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  }, [workspace.leads, workspace.designs, query, filter, city, owner]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, Lead[]>();
    for (const lead of rows) {
      const key = lead.city || "Unknown";
      const list = buckets.get(key) || [];
      list.push(lead);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries());
  }, [rows]);

  const counts = useMemo(() => {
    const all = workspace.leads;
    return {
      all: all.length,
      callable: all.filter((lead) => leadEligibility(lead).tone === "ok").length,
      appointments: all.filter((lead) => /Appointment/.test(lead.status)).length,
      proposals: all.filter((lead) => /Proposal|Contract|Design|PTO/.test(lead.status)).length,
      pinned: all.filter((lead) => isSitePin(lead, workspace.designs)).length,
      dnc: all.filter((lead) => lead.dnc).length,
    };
  }, [workspace.leads, workspace.designs]);

  const selected = rows.find((lead) => lead.id === selectedLeadId) || workspace.leads.find((lead) => lead.id === selectedLeadId) || null;
  const selectedLoc = selected ? loc(selected, workspace.designs) : null;
  const selectedOpp = selected ? workspace.opportunities.find((item) => item.leadId === selected.id) : null;
  const selectedCallback = selected
    ? workspace.callbacks.find((item) => item.leadId === selected.id && item.status === "open")
    : null;
  const selectedAppt = selected
    ? workspace.appointments.find((item) => item.leadId === selected.id && !/cancel|no-show/i.test(item.status || ""))
    : null;
  const selectedDesign = selected ? workspace.designs[selected.id] : null;
  const eligibility = selected ? leadEligibility(selected) : null;
  const cityCount = useMemo(() => new Set(rows.map((lead) => lead.city)).size, [rows]);

  function fit(points = rows.map((lead) => loc(lead, workspace.designs))) {
    if (!points.length) return;
    const lats = points.map((point) => point.lat);
    const lngs = points.map((point) => point.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const lat = (minLat + maxLat) / 2;
    const lng = (minLng + maxLng) / 2;
    const view = viewRef.current;
    const pad = 1.4;
    const latSpan = Math.max(maxLat - minLat, 0.018) * pad;
    const lngSpan = Math.max(maxLng - minLng, 0.018) * pad;
    let nextZoom = 8;
    if (view?.width && view.height) {
      const zLng = Math.log2((view.width / 256) * (360 / lngSpan));
      const zLat = Math.log2((view.height / 256) * ((360 * Math.cos((lat * Math.PI) / 180)) / latSpan));
      nextZoom = Math.max(5.2, Math.min(13.4, Math.min(zLng, zLat)));
    } else {
      const span = Math.max(latSpan, lngSpan);
      nextZoom = span < 0.08 ? 12.5 : span < 0.35 ? 10.2 : span < 1.1 ? 8.2 : span < 3 ? 6.8 : 5.8;
    }
    setCenter({ lat, lng });
    setZoom(nextZoom);
  }

  function selectLead(leadId: string, focus = true) {
    setSelectedLeadId(leadId);
    if (!focus) return;
    const lead = workspace.leads.find((item) => item.id === leadId);
    if (!lead) return;
    const point = loc(lead, workspace.designs);
    setCenter({ lat: point.lat, lng: point.lng });
    setZoom((current) => Math.max(current, 12.2));
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
    if (loading || !didFit.current) return;
    if (!rows.length) return;
    fit();
  }, [filter, city, owner, query]);

  useEffect(() => {
    if (!selectedLeadId || !listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(`[data-lead="${selectedLeadId}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [selectedLeadId, rows]);

  const didPick = useRef(false);
  useEffect(() => {
    if (loading || didPick.current || selectedLeadId || !rows[0]) return;
    didPick.current = true;
    setSelectedLeadId(rows[0].id);
  }, [loading, selectedLeadId, rows, setSelectedLeadId]);

  if (loading) {
    return (
      <div className="map-desk map-loading">
        <div className="map-empty-state">Loading map…</div>
      </div>
    );
  }

  const hoverLead = hoverId ? workspace.leads.find((lead) => lead.id === hoverId) : null;

  return (
    <div className="map-desk">
      <header className="map-top">
        <input
          className="az-input map-search"
          placeholder="Search name, city, owner, status"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search map"
        />
        <select
          className="az-select map-city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          aria-label="City"
        >
          <option value="all">All cities</option>
          {cities.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          className="az-select map-owner"
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
          aria-label="Owner"
        >
          <option value="all">All owners</option>
          {owners.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <div className="map-filters" role="tablist" aria-label="Map filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={filter === item.id ? "on" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <em>{counts[item.id]}</em>
            </button>
          ))}
        </div>
        <div className="map-top-actions">
          <button type="button" className="az-btn" onClick={() => fit()} disabled={!rows.length}>
            Fit
          </button>
          <button type="button" className="az-btn" onClick={() => setKind((value) => (value === "streets" ? "satellite" : "streets"))}>
            {kind === "streets" ? "Streets" : "Satellite"}
          </button>
        </div>
      </header>

      <div className="map-body">
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
              <p className="map-inspect-property">
                {selected.property || "Property unset"}
                {selected.address ? ` · ${selected.address}` : ""}
              </p>
              <dl className="map-inspect-facts">
                <div>
                  <dt>Phone</dt>
                  <dd>{phonePretty(selected.phone)}</dd>
                </div>
                <div>
                  <dt>Consent</dt>
                  <dd>{eligibility?.label || "—"}</dd>
                </div>
                <div>
                  <dt>Utility</dt>
                  <dd>
                    {selected.utility || "—"}
                    {selected.monthlyBill ? ` · ${money(selected.monthlyBill)}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{selected.owner || "—"}</dd>
                </div>
                <div className="span">
                  <dt>Next</dt>
                  <dd>{selected.nextAction || "—"}</dd>
                </div>
                {selectedCallback ? (
                  <div className="span">
                    <dt>Follow-up</dt>
                    <dd className={Date.parse(selectedCallback.dueAt) < Date.now() ? "late" : ""}>
                      {relativeDue(selectedCallback.dueAt)} · {selectedCallback.reason}
                    </dd>
                  </div>
                ) : null}
                {selectedAppt ? (
                  <div className="span">
                    <dt>Appointment</dt>
                    <dd>
                      {selectedAppt.type || "Sit"}
                      {selectedAppt.startsAt ? ` · ${relativeDue(selectedAppt.startsAt)}` : ""}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>{selectedOpp ? "Deal" : "Est. value"}</dt>
                  <dd className="az-num">
                    {selectedOpp
                      ? moneyShort(selectedOpp.value)
                      : selected.estimatedValue
                        ? moneyShort(selected.estimatedValue)
                        : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Design</dt>
                  <dd>{designSummary(selected, selectedDesign || undefined) || "No design"}</dd>
                </div>
                <div className="span">
                  <dt>Location</dt>
                  <dd>
                    {selectedLoc.pinned ? "Site pin (moved from city estimate)" : "City estimate — not a street address"}
                  </dd>
                </div>
              </dl>
              <p className="map-inspect-hint">Shift-drag, or drag at zoom 12+, to set a site pin for Design.</p>
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
              <div className="az-kicker">Household</div>
              <p>Pick a row. The map follows. Hollow pins are city estimates until a site pin is set.</p>
            </div>
          )}

          <div className="map-list-head">
            <span>{city === "all" ? "By city" : city}</span>
            <span className="az-num">{rows.length}</span>
          </div>
          <div className="map-list" ref={listRef}>
            {rows.length === 0 ? <div className="map-list-empty">No contacts in this view.</div> : null}
            {grouped.map(([name, leads]) => (
              <div key={name} className="map-city-group">
                {city === "all" ? (
                  <button
                    type="button"
                    className="map-city-head"
                    onClick={() => {
                      setCity(name);
                    }}
                  >
                    <span>{name}</span>
                    <em>{leads.length}</em>
                  </button>
                ) : null}
                {leads.map((lead) => {
                  const point = loc(lead, workspace.designs);
                  const tone = pinTone(lead);
                  const callback = workspace.callbacks.find((item) => item.leadId === lead.id && item.status === "open");
                  const hot = hoverId === lead.id || Boolean(hoverGroup?.includes(lead.id));
                  return (
                    <button
                      key={lead.id}
                      type="button"
                      data-lead={lead.id}
                      className={`map-list-row ${selected?.id === lead.id ? "on" : ""} ${hot ? "hover" : ""}`}
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
                        <em>{lead.owner || "—"}</em>
                        <em className={point.pinned ? "pin" : "est"}>{point.pinned ? "site" : "est"}</em>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="map-legend">
            <i className="lead" /> Lead
            <i className="ok" /> Qualified
            <i className="sit" /> Appt
            <i className="paper" /> Proposal
            <i className="dnc" /> DNC
            <span className="map-legend-note">Hollow = city estimate</span>
          </div>
        </aside>

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
              const cell = zoom >= 11.4 ? 0 : zoom >= 9 ? 0.1 : 0.26;
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
                      const ids = group.leads.map((lead) => lead.id);
                      const active = ids.some((id) => id === selectedLeadId || id === hoverId || hoverGroup?.includes(id));
                      const cityNames = Array.from(new Set(group.leads.map((lead) => lead.city).filter(Boolean)));
                      return (
                        <g
                          key={`${group.lat}:${group.lng}`}
                          className={`map-cluster ${active ? "on" : ""}`}
                          transform={`translate(${screen.x} ${screen.y})`}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            fit(group.leads.map((lead) => loc(lead, workspace.designs)));
                            if (group.leads[0]) setSelectedLeadId(group.leads[0].id);
                          }}
                          onPointerEnter={() => {
                            setHoverId(group.leads[0]?.id || null);
                            setHoverGroup(ids);
                          }}
                          onPointerLeave={() => {
                            setHoverId(null);
                            setHoverGroup(null);
                          }}
                        >
                          <title>
                            {group.leads.length} in {cityNames.length === 1 ? cityNames[0] : `${cityNames.length} cities`}
                          </title>
                          <circle r={Math.min(24, 11 + group.leads.length * 1.4)} />
                          <text textAnchor="middle" dy="4">
                            {group.leads.length}
                          </text>
                        </g>
                      );
                    }
                    const lead = group.leads[0];
                    const point = loc(lead, workspace.designs);
                    const on = selectedLeadId === lead.id;
                    const hover = hoverId === lead.id || Boolean(hoverGroup?.includes(lead.id));
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
                        <title>
                          {lead.name} · {lead.city} · {point.pinned ? "site pin" : "city estimate"}
                        </title>
                        <circle className="map-pin-halo" r={on || hover ? 15 : 11} />
                        <circle className="map-pin-dot" r={on ? 6.5 : 5} />
                        {!point.pinned ? <circle className="map-pin-ring" r={8.5} /> : null}
                        {on || hover ? (
                          <text className="map-pin-name" x="12" y="-6">
                            {lead.name}
                          </text>
                        ) : null}
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
                  setOwner("all");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <footer className="map-status">
        <span>
          {rows.length} in view · {cityCount} {cityCount === 1 ? "city" : "cities"}
          {owner !== "all" ? ` · ${owner}` : ""}
        </span>
        <span>
          {selected
            ? `${selected.name} · ${selected.city} · ${selectedLoc?.pinned ? "site pin" : "city estimate"}`
            : hoverLead
              ? `${hoverLead.name} · ${hoverLead.city}`
              : "Select a location"}
        </span>
      </footer>
    </div>
  );
}

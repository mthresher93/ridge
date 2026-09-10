"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { compassLabel, estimateFor } from "@/lib/solar";
import { money, nowIso, uid } from "@/lib/format";
import {
  edgeLengths,
  fillFace,
  formatFeet,
  liveMetrics,
  parseFeetInches,
  plausibleGeometry,
  polygonArea,
  sanitizeSite,
  siteBounds,
  syncLegacy,
} from "@/lib/site";
import { coordsFor, lngLatToSite, siteToLngLat } from "@/lib/geo";
import { MAX_ZOOM, MIN_ZOOM, TileMap, type MapKind } from "./tile-map";
import { SiteCanvas, rotateSelectedFace, selectedModuleIds, type CadSel, type CadTool } from "./site-canvas";
import type { Obstruction, Point, Proposal, RoofDesign, RoofFace } from "@/lib/types";
import { ProposalFlow } from "./proposal-flow";

const CORE_TOOLS: { id: CadTool; label: string; key: string; glyph: string }[] = [
  { id: "pan", label: "Pan", key: "H", glyph: "✥" },
  { id: "select", label: "Select", key: "V", glyph: "↖" },
  { id: "draw", label: "Roof", key: "R", glyph: "⬠" },
  { id: "measure", label: "Measure", key: "M", glyph: "⟷" },
];

const PLACE_TOOLS: { id: CadTool; label: string; key: string; glyph: string }[] = [
  { id: "panel", label: "Panel", key: "P", glyph: "▦" },
  { id: "gear", label: "Obstruct", key: "O", glyph: "◎" },
  { id: "tree", label: "Tree", key: "T", glyph: "♣" },
];

const TOOLS = [...CORE_TOOLS, ...PLACE_TOOLS];

export function DesignView() {
  const { workspace, setWorkspace, loading, selectedLeadId, setSelectedLeadId, log } = useWorkspace();
  const lead = workspace.leads.find((item) => item.id === selectedLeadId) || workspace.leads[0];
  const raw = lead ? workspace.designs?.[lead.id] : null;
  const [tool, setTool] = useState<CadTool>("select");
  const [sel, setSel] = useState<CadSel>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [kind, setKind] = useState<MapKind>("satellite");
  const [zoom, setZoom] = useState(19);
  const [center, setCenter] = useState({ lat: 35.37, lng: -119.02 });
  const [showProposal, setShowProposal] = useState(false);
  const [spacePan, setSpacePan] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const holdView = useRef(0);
  const past = useRef<RoofDesign[]>([]);
  const future = useRef<RoofDesign[]>([]);

  useEffect(() => {
    if (!raw || !lead) return;
    let site = raw;
    if (!plausibleGeometry(raw)) {
      site = syncLegacy({ ...raw, faces: [], modules: [] });
      setWorkspace((prev) => ({
        ...prev,
        designs: { ...prev.designs, [lead.id]: { ...site, updatedAt: nowIso() } },
        updatedAt: nowIso(),
      }));
    } else {
      const cleaned = sanitizeSite(raw);
      if (
        cleaned.modules?.length !== raw.modules?.length ||
        cleaned.obstructions?.length !== raw.obstructions?.length ||
        cleaned.faces !== raw.faces
      ) {
        site = syncLegacy(cleaned);
        setWorkspace((prev) => ({
          ...prev,
          designs: { ...prev.designs, [lead.id]: { ...site, updatedAt: nowIso() } },
          updatedAt: nowIso(),
        }));
      }
    }
    const origin = {
      lat: site.lat || coordsFor(lead.city || "", lead.id).lat,
      lng: site.lng || coordsFor(lead.city || "", lead.id).lng,
    };
    if (!site.lat || !site.lng) {
      site = { ...site, lat: origin.lat, lng: origin.lng };
      setWorkspace((prev) => ({
        ...prev,
        designs: { ...prev.designs, [lead.id]: { ...site, updatedAt: nowIso() } },
        updatedAt: nowIso(),
      }));
    }
    const frame = () => {
      const fit = fitFor(site, origin, canvasRef.current);
      holdView.current = Date.now();
      setCenter(fit.center);
      setZoom(fit.zoom);
    };
    frame();
    const id = requestAnimationFrame(frame);
    setSel(null);
    setDraft([]);
    setShowProposal(false);
    past.current = [];
    future.current = [];
    return () => cancelAnimationFrame(id);
  }, [lead?.id]);

  const design = raw;
  const estimate = lead && design ? estimateFor(lead, design) : null;
  const live = design ? liveMetrics(design) : null;
  const face = design && (sel?.kind === "face" || sel?.kind === "vertex" || sel?.kind === "edge")
    ? (design.faces || []).find((item) => item.id === sel.id)
    : null;

  function cloneDesign(value: RoofDesign): RoofDesign {
    return JSON.parse(JSON.stringify(value)) as RoofDesign;
  }

  function remember() {
    if (!design) return;
    past.current = [...past.current.slice(-50), cloneDesign(design)];
    future.current = [];
  }

  function writeDesign(next: RoofDesign) {
    if (!lead) return;
    const stamped = syncLegacy({ ...next, updatedAt: nowIso() });
    setWorkspace((prev) => ({
      ...prev,
      designs: { ...prev.designs, [lead.id]: stamped },
      updatedAt: stamped.updatedAt,
    }));
  }

  function patch(partial: Partial<RoofDesign> | ((prev: RoofDesign) => RoofDesign)) {
    if (!lead || !design) return;
    remember();
    writeDesign(typeof partial === "function" ? partial(design) : { ...design, ...partial });
  }

  function undo() {
    const prev = past.current.pop();
    if (!prev || !design) return;
    future.current.push(cloneDesign(design));
    writeDesign(prev);
    setSel(null);
  }

  function redo() {
    const next = future.current.pop();
    if (!next || !design) return;
    past.current.push(cloneDesign(design));
    writeDesign(next);
    setSel(null);
  }

  function nudge(dx: number, dy: number) {
    if (!design || !sel) return;
    remember();
    if (sel.kind === "vertex") {
      writeDesign({
        ...design,
        faces: (design.faces || []).map((item) =>
          item.id === sel.id
            ? { ...item, points: item.points.map((pt, i) => (i === sel.index ? { x: pt.x + dx, y: pt.y + dy } : pt)) }
            : item,
        ),
      });
      return;
    }
    if (sel.kind === "edge") {
      writeDesign({
        ...design,
        faces: (design.faces || []).map((item) => {
          if (item.id !== sel.id) return item;
          return {
            ...item,
            points: item.points.map((pt, i) =>
              i === sel.index || i === (sel.index + 1) % item.points.length ? { x: pt.x + dx, y: pt.y + dy } : pt,
            ),
          };
        }),
      });
      return;
    }
    if (sel.kind === "face") {
      writeDesign({
        ...design,
        faces: (design.faces || []).map((item) =>
          item.id === sel.id ? { ...item, points: item.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) } : item,
        ),
        modules: (design.modules || []).map((mod) => (mod.faceId === sel.id ? { ...mod, x: mod.x + dx, y: mod.y + dy } : mod)),
      });
      return;
    }
    if (sel.kind === "module") {
      const ids = new Set(selectedModuleIds(sel));
      writeDesign({
        ...design,
        modules: (design.modules || []).map((mod) => (ids.has(mod.id) ? { ...mod, x: mod.x + dx, y: mod.y + dy } : mod)),
      });
      return;
    }
    writeDesign({
      ...design,
      obstructions: (design.obstructions || []).map((item) =>
        item.id === sel.id ? { ...item, x: item.x + dx, y: item.y + dy } : item,
      ),
    });
  }

  function saveProposal() {
    if (!lead || !estimate || !live || !design) return;
    const fromModules = live.panelCount > 0;
    const systemKw = fromModules ? live.systemKw : estimate.systemKw;
    const panelCount = fromModules ? live.panelCount : estimate.panelCount;
    const stamp = fromModules
      ? `${systemKw} kW · ${panelCount} modules · ${live.roofSqFt} ft² roof · ${estimate.offset}% offset · cash ${money(estimate.netPrice)}`
      : `${systemKw} kW estimated from bill · no modules placed · cash ${money(estimate.netPrice)}`;
    const priorNotes = workspace.proposals?.[lead.id]?.notes || "";
    const notes = priorNotes && !/^\d+(\.\d+)? kW ·/.test(priorNotes) && !priorNotes.includes("no modules placed")
      ? priorNotes
      : stamp;
    const snapshot: Proposal = {
      leadId: lead.id,
      status: "Internal review",
      version: (workspace.proposals?.[lead.id]?.version || 0) + 1,
      notes,
      updatedAt: nowIso(),
      customerName: lead.name,
      property: lead.property,
      address: lead.address || `${lead.property}, ${lead.city}`,
      city: lead.city,
      utility: lead.utility,
      monthlyBill: lead.monthlyBill,
      panelWatts: design.panelWatts,
      panelWidthIn: design.panelWidthIn,
      panelHeightIn: design.panelHeightIn,
      panelCount,
      systemKw,
      roofSqFt: live.roofSqFt,
      usableSqFt: live.usableSqFt,
      panelSqFt: live.panelSqFt,
      coverage: live.coverage,
      setbackFt: design.setbackFt,
      faceCount: (design.faces || []).length,
      offset: estimate.offset,
      annualProduction: estimate.annualProduction,
      annualUse: estimate.annualUse,
      annualSunHours: design.annualSunHours,
      grossPrice: estimate.grossPrice,
      incentive: estimate.incentive,
      netPrice: estimate.netPrice,
      monthlyPayment: estimate.monthlyPayment,
      annualSavings: estimate.annualSavings,
      azimuthDeg: design.azimuthDeg,
      tiltDeg: design.tiltDeg,
      roofMaterial: design.roofMaterial,
      shadeLoss: design.shadeLoss,
      source: fromModules ? "modules" : "bill-plan",
      arrayOutline: {
        faces: (design.faces || []).map((face) => ({
          id: face.id,
          points: face.points.map((p) => ({ x: p.x, y: p.y })),
          eligible: face.eligible,
        })),
        modules: (design.modules || []).map((mod) => ({
          x: mod.x,
          y: mod.y,
          rotationDeg: mod.rotationDeg || 0,
          portrait: mod.portrait !== false,
        })),
        panelWidthIn: design.panelWidthIn ?? 41,
        panelHeightIn: design.panelHeightIn ?? 74,
      },
    };
    setWorkspace((prev) => {
      const stamped = snapshot.updatedAt;
      return {
        ...prev,
        proposals: {
          ...prev.proposals,
          [lead.id]: snapshot,
        },
        leads: prev.leads.map((item) =>
          item.id === lead.id && !/Proposal|Contract|PTO|Won/.test(item.status)
            ? { ...item, status: "Proposal", nextAction: "Present proposal", updatedAt: stamped }
            : item,
        ),
        opportunities: prev.opportunities.map((item) => {
          if (item.leadId !== lead.id || /Proposal|Contract|Won|Lost/.test(item.stage)) return item;
          return {
            ...item,
            stage: "Proposal",
            probability: 60,
            value: item.value || estimate.netPrice,
            stageEnteredAt: stamped,
            updatedAt: stamped,
            history: [{ from: item.stage, to: "Proposal", at: stamped, source: "design" }, ...item.history],
          };
        }),
        updatedAt: stamped,
      };
    });
    log("lead", lead.id, "proposal", notes);
  }

  function markPresented() {
    if (!lead) return;
    const current = workspace.proposals?.[lead.id];
    if (!current) return;
    const stamped = nowIso();
    setWorkspace((prev) => ({
      ...prev,
      proposals: {
        ...prev.proposals,
        [lead.id]: { ...current, status: "Presented", updatedAt: stamped },
      },
      updatedAt: stamped,
    }));
    log("lead", lead.id, "proposal_presented", "Proposal marked presented");
  }

  function fitSite() {
    if (!design) return;
    const origin = { lat: design.lat || center.lat, lng: design.lng || center.lng };
    const fit = fitFor(design, origin, canvasRef.current);
    holdView.current = Date.now();
    setCenter(fit.center);
    setZoom(fit.zoom);
  }

  function zoomBy(delta: number) {
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)));
  }

  function setOriginFromView() {
    if (!lead || !design) return;
    const from = { lat: design.lat || center.lat, lng: design.lng || center.lng };
    const to = { lat: center.lat, lng: center.lng };
    const remap = (point: Point) => {
      const geo = siteToLngLat(from, point.x, point.y);
      return lngLatToSite(to, geo.lng, geo.lat);
    };
    patch({
      lat: to.lat,
      lng: to.lng,
      faces: (design.faces || []).map((item) => ({ ...item, points: item.points.map(remap) })),
      modules: (design.modules || []).map((mod) => {
        const next = remap({ x: mod.x, y: mod.y });
        return { ...mod, x: next.x, y: next.y };
      }),
      obstructions: (design.obstructions || []).map((item) => {
        const next = remap({ x: item.x, y: item.y });
        return { ...item, x: next.x, y: next.y };
      }),
    });
    log("lead", lead.id, "site_origin", `Site origin set to ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (event.code === "Space" && !typing) {
        event.preventDefault();
        if (!event.repeat) setSpacePan(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (!typing && !event.metaKey && !event.ctrlKey) {
        const hit = TOOLS.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
        if (hit && !event.altKey) {
          event.preventDefault();
          setTool(hit.id);
          return;
        }
        if (event.key === "f" || event.key === "F") {
          event.preventDefault();
          fitSite();
          return;
        }
        if (sel && design && /^Arrow/.test(event.key)) {
          event.preventDefault();
          const step = event.altKey ? 2 : event.shiftKey ? 0.1 : 0.5;
          const dx = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
          const dy = event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
          nudge(dx, dy);
          return;
        }
      }
      if (event.key === "Escape") {
        if (draft.length) {
          setDraft((prev) => prev.slice(0, -1));
          return;
        }
        setSel(null);
        setTool("select");
      }
      if (event.key === "Enter" && tool === "draw" && draft.length >= 3 && design) {
        const next: RoofFace = {
          id: uid("face"),
          points: draft,
          pitchDeg: design.tiltDeg,
          azimuthDeg: design.azimuthDeg,
          heightFt: 12,
          material: design.roofMaterial,
          eligible: true,
          source: "survey",
        };
        patch({ faces: [...(design.faces || []), next] });
        setDraft([]);
        setSel({ kind: "face", id: next.id });
        setTool("select");
      }
      if ((event.key === "Backspace" || event.key === "Delete") && sel && design) {
        event.preventDefault();
        if (sel.kind === "face") {
          patch({
            faces: (design.faces || []).filter((item) => item.id !== sel.id),
            modules: (design.modules || []).filter((item) => item.faceId !== sel.id),
          });
        }
        if (sel.kind === "vertex") {
          const face = (design.faces || []).find((item) => item.id === sel.id);
          if (face && face.points.length > 3) {
            patch({
              faces: (design.faces || []).map((item) =>
                item.id === sel.id ? { ...item, points: item.points.filter((_, i) => i !== sel.index) } : item,
              ),
            });
            setSel({ kind: "face", id: sel.id });
            return;
          }
        }
        if (sel.kind === "module") {
          const ids = new Set(selectedModuleIds(sel));
          patch({ modules: (design.modules || []).filter((item) => !ids.has(item.id)) });
        }
        if (sel.kind === "obstruction") patch({ obstructions: (design.obstructions || []).filter((item) => item.id !== sel.id) });
        setSel(null);
      }
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePan(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [tool, draft, sel, design]);

  const address = lead ? lead.address || `${lead.property}, ${lead.city}` : "";

  if (loading || !lead || !design || !estimate || !live) return <div className="cd-body text-[var(--tx4)]">Loading design…</div>;

  const hasFace = (design.faces || []).length > 0;
  const railTools = hasFace ? TOOLS : CORE_TOOLS;

  return (
    <div className={`cad-desk ${showProposal ? "has-prop" : ""}`}>
      <header className="cad-top">
        <label className="cad-project">
          <span>Project</span>
          <select
            value={lead.id}
            onChange={(event) => setSelectedLeadId(event.target.value)}
          >
            {workspace.leads
              .filter((item) => !item.dnc)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.city}
                </option>
              ))}
          </select>
        </label>
        <div className="cad-address">{address}</div>
        <div className="cad-top-actions">
          <button type="button" className="az-btn" onClick={() => setKind((k) => (k === "satellite" ? "streets" : "satellite"))}>
            {kind === "satellite" ? "Satellite" : "Streets"}
          </button>
          <div className="cad-zoom" role="group" aria-label="Zoom">
            <button type="button" onClick={() => zoomBy(-0.5)} title="Zoom out">
              −
            </button>
            <button type="button" onClick={fitSite} title="Fit roof to view">
              Fit
            </button>
            <button type="button" onClick={() => zoomBy(0.5)} title="Zoom in">
              +
            </button>
          </div>
          <button type="button" className="az-btn" onClick={setOriginFromView}>
            Set origin
          </button>
          <button
            type="button"
            className={`az-btn ${showProposal ? "pri" : ""}`}
            onClick={() => {
              setShowProposal((v) => !v);
              setSel(null);
            }}
          >
            Proposal
          </button>
        </div>
      </header>

      <div className="cad-body">
        <aside className="cad-tools">
          {railTools.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tool === item.id ? "on" : ""}
              onClick={() => setTool(item.id)}
              title={`${item.label} (${item.key})`}
            >
              <i aria-hidden>{item.glyph}</i>
              <span>{item.label}</span>
              <kbd>{item.key}</kbd>
            </button>
          ))}
        </aside>

        <div className="cad-canvas" ref={canvasRef}>
          <TileMap key={lead.id} lat={center.lat} lng={center.lng} zoom={zoom} kind={kind} onMove={(next) => {
            if (Date.now() - holdView.current < 250) return;
            setCenter({ lat: next.lat, lng: next.lng });
            setZoom(next.zoom);
          }}>
            {(view) => (
              <SiteCanvas
                design={design}
                view={view}
                tool={spacePan ? "pan" : tool}
                sel={sel}
                onSel={(next) => {
                  setSel(next);
                  if (next) setShowProposal(false);
                }}
                onChange={(next) => writeDesign(next)}
                onWillChange={remember}
                draft={draft}
                onDraft={setDraft}
                onTool={setTool}
              />
            )}
          </TileMap>
          <div className="cad-hint">
            {spacePan
              ? "Space: pan. Release to return to the last tool."
              : tool === "draw"
                ? "Click vertices. Shift constrains axis. Snap to the first point to close. Esc undoes the last point."
                : tool === "panel"
                  ? `Click to place a ${design.panelWatts}W · ${design.panelWidthIn ?? 41}×${design.panelHeightIn ?? 74} in module. Ghost snaps to neighbors.`
                  : tool === "measure"
                    ? "Click two points. Length is site feet."
                    : !hasFace
                      ? "No surveyed roof. Draw the perimeter on the imagery. Space pans · ⌘Z undoes."
                      : "Drag after a short press. Shift-click modules to multi-select. Arrows nudge · ⌘Z undo."}
          </div>
        </div>

        <aside className="cad-inspector">
          <div className="cad-insp-block cad-system">
            <div className="az-kicker">System</div>
            <div className="cad-metrics">
              <div>
                <span>Modules</span>
                <b className="az-num">{live.panelCount || "—"}</b>
              </div>
              <div>
                <span>DC size</span>
                <b className="az-num">{live.panelCount ? `${live.systemKw} kW` : "—"}</b>
              </div>
              <div>
                <span>Roof</span>
                <b className="az-num">{live.roofSqFt} ft²</b>
              </div>
              <div>
                <span>Usable</span>
                <b className="az-num">{live.usableSqFt} ft²</b>
              </div>
              <div>
                <span>Panel area</span>
                <b className="az-num">{live.panelCount ? `${live.panelSqFt} ft²` : "—"}</b>
              </div>
              <div>
                <span>Coverage</span>
                <b className="az-num">{live.panelCount ? `${live.coverage}%` : "—"}</b>
              </div>
            </div>
            {!live.panelCount ? (
              <p className="cad-note">No modules placed. Plan size below is bill-based planning, not a surveyed array.</p>
            ) : null}
            {!hasFace ? (
              <p className="cad-note">Roof area and coverage stay empty until a face is drawn. Bill-based plan size is not a surveyed array.</p>
            ) : null}
          </div>

          {face ? (
            <FaceInspector
              face={face}
              sel={sel}
              onFace={(next) => patch({ faces: (design.faces || []).map((item) => (item.id === face.id ? next : item)) })}
              onFill={(portrait) => patch({ modules: fillFace(face, design, design.modules || [], portrait) })}
              onRotate={() => patch(rotateSelectedFace(design, face.id, 15))}
              onCopy={() => {
                const copy: RoofFace = {
                  ...face,
                  id: uid("face"),
                  points: face.points.map((p) => ({ x: p.x + 8, y: p.y + 8 })),
                };
                patch({ faces: [...(design.faces || []), copy] });
                setSel({ kind: "face", id: copy.id });
              }}
            />
          ) : null}

          {sel?.kind === "module" ? (
            <ModuleInspector
              design={design}
              ids={selectedModuleIds(sel)}
              onChange={(next) => patch({ modules: (design.modules || []).map((row) => (row.id === next.id ? next : row)) })}
              onChangeMany={(partial) =>
                patch({
                  modules: (design.modules || []).map((row) =>
                    selectedModuleIds(sel).includes(row.id) ? { ...row, ...partial } : row,
                  ),
                })
              }
              onDelete={() => {
                const ids = new Set(selectedModuleIds(sel));
                patch({ modules: (design.modules || []).filter((row) => !ids.has(row.id)) });
                setSel(null);
              }}
            />
          ) : null}

          {sel?.kind === "obstruction" ? (
            <ObstructionInspector
              item={(design.obstructions || []).find((row) => row.id === sel.id)}
              onChange={(next) => patch({ obstructions: (design.obstructions || []).map((row) => (row.id === next.id ? next : row)) })}
              onDelete={() => patch({ obstructions: (design.obstructions || []).filter((row) => row.id !== sel.id) })}
            />
          ) : null}

          {!sel && !showProposal ? (
            <div className="cad-insp-block">
              <div className="az-kicker">Site</div>
              <label>
                Setback (ft)
                <input
                  className="az-input"
                  type="number"
                  value={design.setbackFt ?? 3}
                  onChange={(event) => patch({ setbackFt: Number(event.target.value) || 0 })}
                />
              </label>
              <label>
                Assumed shade loss %
                <input
                  className="az-input"
                  type="number"
                  value={design.shadeLoss}
                  onChange={(event) => patch({ shadeLoss: Number(event.target.value) })}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  Module W
                  <input
                    className="az-input"
                    type="number"
                    value={design.panelWatts}
                    onChange={(event) => patch({ panelWatts: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Spacing in
                  <input
                    className="az-input"
                    type="number"
                    value={design.spacingIn ?? 0.5}
                    onChange={(event) => patch({ spacingIn: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Width in
                  <input
                    className="az-input"
                    type="number"
                    value={design.panelWidthIn ?? 41}
                    onChange={(event) => patch({ panelWidthIn: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Height in
                  <input
                    className="az-input"
                    type="number"
                    value={design.panelHeightIn ?? 74}
                    onChange={(event) => patch({ panelHeightIn: Number(event.target.value) })}
                  />
                </label>
              </div>
              <p className="cad-note">Setback inset is a design offset for fill/eligibility — not an AHJ code check. Shade % is assumed.</p>
            </div>
          ) : null}

          {showProposal ? (
            <div className="cad-insp-block prop-insp">
              <ProposalFlow
                lead={lead}
                design={design}
                estimate={estimate}
                live={live}
                saved={workspace.proposals?.[lead.id]}
                onSave={saveProposal}
                onMarkPresented={markPresented}
              />
            </div>
          ) : null}

          {!sel && !showProposal && hasFace ? (
            <button
              type="button"
              className="az-btn"
              onClick={() => {
                patch({ faces: [], modules: [], obstructions: [] });
                setSel(null);
              }}
            >
              Clear geometry
            </button>
          ) : null}
        </aside>
      </div>

      <footer className="cad-status">
        <span>
          {compassLabel(face?.azimuthDeg ?? design.azimuthDeg)} {face?.azimuthDeg ?? design.azimuthDeg}° · pitch {face?.pitchDeg ?? design.tiltDeg}°
        </span>
        <span>
          {live.panelCount ? `${live.panelCount} mod · ${live.systemKw} kW · ${live.panelSqFt} ft² panels` : "No modules"}
        </span>
        <span>
          Roof {live.roofSqFt} ft² · usable ~{live.usableSqFt} ft² · setback {design.setbackFt ?? 3} ft
        </span>
        <span>
          {kind === "satellite" ? "Esri imagery" : "OSM streets"} · z{zoom.toFixed(1)} · {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
        </span>
      </footer>
    </div>
  );
}

/** Frame a surveyed roof. Empty or implausible geometry stays at building zoom on the parcel. */
function fitFor(design: RoofDesign, origin: { lat: number; lng: number }, el: HTMLDivElement | null) {
  if (!(design.faces || []).length || !plausibleGeometry(design)) {
    return { center: { lat: origin.lat, lng: origin.lng }, zoom: 19 };
  }
  const bounds = siteBounds(design);
  const spanFt = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 40);
  const width = el?.clientWidth || 900;
  const height = el?.clientHeight || 600;
  const targetPx = Math.min(width, height) * 0.55;
  const metersPerPx = (spanFt * 0.3048) / targetPx;
  const zoom = Math.log2((156543.03392 * Math.cos((origin.lat * Math.PI) / 180)) / metersPerPx);
  const mid = siteToLngLat(origin, bounds.cx, bounds.cy);
  return { center: { lat: mid.lat, lng: mid.lng }, zoom: Math.max(18, Math.min(21, zoom)) };
}

function FaceInspector({
  face,
  sel,
  onFace,
  onFill,
  onRotate,
  onCopy,
}: {
  face: RoofFace;
  sel: CadSel;
  onFace: (face: RoofFace) => void;
  onFill: (portrait: boolean) => void;
  onRotate: () => void;
  onCopy: () => void;
}) {
  const [portrait, setPortrait] = useState(true);
  const area = Math.round(polygonArea(face.points));
  const lengths = edgeLengths(face.points);
  const edgeLen = sel?.kind === "edge" ? lengths[sel.index] : null;
  const vertex = sel?.kind === "vertex" ? face.points[sel.index] : null;
  return (
    <div className="cad-insp-block">
      <div className="az-kicker">Roof face</div>
      <div className="cad-metrics">
        <div>
          <span>Area</span>
          <b>{area} ft²</b>
        </div>
        <div>
          <span>Azimuth</span>
          <b>{face.azimuthDeg}° {compassLabel(face.azimuthDeg)}</b>
        </div>
      </div>
      <div className="cad-num-row">
        <label>
          Pitch °
          <input className="az-input" type="number" value={face.pitchDeg} onChange={(event) => onFace({ ...face, pitchDeg: Number(event.target.value) })} />
        </label>
        <label>
          Azimuth °
          <input className="az-input" type="number" value={face.azimuthDeg} onChange={(event) => onFace({ ...face, azimuthDeg: Number(event.target.value) })} />
        </label>
        <label>
          Height
          <input className="az-input" type="number" value={face.heightFt} onChange={(event) => onFace({ ...face, heightFt: Number(event.target.value) })} />
        </label>
      </div>
      <label>
        Material
        <input className="az-input" value={face.material} onChange={(event) => onFace({ ...face, material: event.target.value })} />
      </label>
      <label className="cad-check">
        <input
          type="checkbox"
          checked={face.eligible !== false}
          onChange={(event) => onFace({ ...face, eligible: event.target.checked })}
        />
        Panel-eligible face
      </label>
      {vertex ? (
        <div className="grid grid-cols-2 gap-2">
          <label>
            East ft
            <input
              className="az-input"
              type="number"
              step={0.1}
              value={Math.round(vertex.x * 10) / 10}
              onChange={(event) => {
                if (sel?.kind !== "vertex") return;
                const x = Number(event.target.value);
                if (!Number.isFinite(x)) return;
                onFace({
                  ...face,
                  points: face.points.map((pt, i) => (i === sel.index ? { ...pt, x } : pt)),
                });
              }}
            />
          </label>
          <label>
            North ft
            <input
              className="az-input"
              type="number"
              step={0.1}
              value={Math.round(vertex.y * 10) / 10}
              onChange={(event) => {
                if (sel?.kind !== "vertex") return;
                const y = Number(event.target.value);
                if (!Number.isFinite(y)) return;
                onFace({
                  ...face,
                  points: face.points.map((pt, i) => (i === sel.index ? { ...pt, y } : pt)),
                });
              }}
            />
          </label>
        </div>
      ) : null}
      {edgeLen != null ? (
        <label>
          Edge length
          <input
            className="az-input"
            defaultValue={formatFeet(edgeLen)}
            key={`${face.id}-${sel?.kind === "edge" ? sel.index : "x"}-${edgeLen.toFixed(2)}`}
            onBlur={(event) => {
              const next = parseFeetInches(event.target.value);
              if (next == null || sel?.kind !== "edge") return;
              const a = face.points[sel.index];
              const b = face.points[(sel.index + 1) % face.points.length];
              const cur = Math.hypot(b.x - a.x, b.y - a.y) || 1;
              const scale = next / cur;
              const points = face.points.map((pt, i) =>
                i === (sel.index + 1) % face.points.length ? { x: a.x + (b.x - a.x) * scale, y: a.y + (b.y - a.y) * scale } : pt,
              );
              onFace({ ...face, points });
            }}
          />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button" className={`az-btn ${portrait ? "pri" : ""}`} onClick={() => setPortrait(true)}>
          Portrait
        </button>
        <button type="button" className={`az-btn ${!portrait ? "pri" : ""}`} onClick={() => setPortrait(false)}>
          Landscape
        </button>
        <button type="button" className="az-btn pri" onClick={() => onFill(portrait)} disabled={face.eligible === false}>
          Auto-fill
        </button>
        <button type="button" className="az-btn" onClick={onRotate}>
          Rotate 15°
        </button>
        <button type="button" className="az-btn" onClick={onCopy}>
          Copy
        </button>
      </div>
      <p className="cad-note">Arrows nudge. Type an edge length or East/North. Auto-fill uses setback + obstructions.</p>
    </div>
  );
}

function ModuleInspector({
  design,
  ids,
  onChange,
  onChangeMany,
  onDelete,
}: {
  design: RoofDesign;
  ids: string[];
  onChange: (mod: import("@/lib/types").PlacedModule) => void;
  onChangeMany: (partial: Partial<import("@/lib/types").PlacedModule>) => void;
  onDelete: () => void;
}) {
  const mod = (design.modules || []).find((row) => row.id === ids[0]);
  if (!mod) return null;
  const many = ids.length > 1;
  const portrait = mod.portrait !== false;
  const w = portrait ? design.panelWidthIn ?? 41 : design.panelHeightIn ?? 74;
  const h = portrait ? design.panelHeightIn ?? 74 : design.panelWidthIn ?? 41;
  return (
    <div className="cad-insp-block">
      <div className="az-kicker">{many ? `${ids.length} modules` : "Module"}</div>
      <p className="cad-note">
        {w}&quot; × {h}&quot; · {design.panelWatts}W{many ? "" : ` · ${portrait ? "portrait" : "landscape"}`}
      </p>
      {many ? null : (
        <label>
          Rotation °
          <input
            className="az-input"
            type="number"
            value={mod.rotationDeg}
            onChange={(event) => onChange({ ...mod, rotationDeg: Number(event.target.value) })}
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2 mt-1">
        <button type="button" className={`az-btn ${portrait ? "pri" : ""}`} onClick={() => onChangeMany({ portrait: true })}>
          Portrait
        </button>
        <button type="button" className={`az-btn ${!portrait ? "pri" : ""}`} onClick={() => onChangeMany({ portrait: false })}>
          Landscape
        </button>
        {many ? null : (
          <button type="button" className="az-btn" onClick={() => onChange({ ...mod, rotationDeg: (mod.rotationDeg + 90) % 360 })}>
            Rotate 90°
          </button>
        )}
        <button type="button" className="az-btn" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function ObstructionInspector({
  item,
  onChange,
  onDelete,
}: {
  item?: Obstruction;
  onChange: (item: Obstruction) => void;
  onDelete: () => void;
}) {
  if (!item) return null;
  return (
    <div className="cad-insp-block">
      <div className="az-kicker">{item.kind}</div>
      {(["widthFt", "lengthFt", "heightFt"] as const).map((key) => (
        <label key={key}>
          {key.replace("Ft", " (ft)")}
          <input
            className="az-input"
            type="number"
            value={item[key]}
            onChange={(event) => onChange({ ...item, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
      <button type="button" className="az-btn" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

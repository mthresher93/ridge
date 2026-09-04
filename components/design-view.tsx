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
  polygonArea,
  siteBounds,
  syncLegacy,
} from "@/lib/site";
import { coordsFor, siteToLngLat } from "@/lib/geo";
import { TileMap, type MapKind } from "./tile-map";
import { SiteCanvas, rotateSelectedFace, type CadSel, type CadTool } from "./site-canvas";
import type { Obstruction, Point, Proposal, RoofDesign, RoofFace } from "@/lib/types";
import { ProposalFlow } from "./proposal-flow";

const TOOLS: { id: CadTool; label: string; key: string }[] = [
  { id: "pan", label: "Pan", key: "H" },
  { id: "select", label: "Select", key: "V" },
  { id: "draw", label: "Roof", key: "R" },
  { id: "vertex", label: "Vertex", key: "E" },
  { id: "panel", label: "Panel", key: "P" },
  { id: "gear", label: "Obst", key: "O" },
  { id: "tree", label: "Tree", key: "T" },
  { id: "measure", label: "Measure", key: "M" },
];

function cloneDesign(design: RoofDesign): RoofDesign {
  return structuredClone(design);
}

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
  const [spacePan, setSpacePan] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [histTick, setHistTick] = useState(0);
  const pastRef = useRef<RoofDesign[]>([]);
  const futureRef = useRef<RoofDesign[]>([]);
  const designRef = useRef<RoofDesign | null>(null);
  const selRef = useRef<CadSel>(null);
  const toolRef = useRef<CadTool>(tool);
  const draftRef = useRef<Point[]>(draft);
  const centerRef = useRef(center);
  const leadIdRef = useRef(lead?.id);

  useEffect(() => {
    if (!raw) return;
    const lat = raw.lat || coordsFor(lead?.city || "", lead?.id || "").lat;
    const lng = raw.lng || coordsFor(lead?.city || "", lead?.id || "").lng;
    setCenter({ lat, lng });
    setZoom(19);
    setSel(null);
    setDraft([]);
    pastRef.current = [];
    futureRef.current = [];
    setHistTick((n) => n + 1);
  }, [lead?.id]);

  const design = raw;
  designRef.current = design || null;
  selRef.current = sel;
  toolRef.current = tool;
  draftRef.current = draft;
  centerRef.current = center;
  leadIdRef.current = lead?.id;
  const estimate = lead && design ? estimateFor(lead, design) : null;
  const live = design ? liveMetrics(design) : null;
  const face = design && (sel?.kind === "face" || sel?.kind === "vertex" || sel?.kind === "edge")
    ? (design.faces || []).find((item) => item.id === sel.id)
    : null;
  const activeTool = spacePan ? "pan" : tool;
  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  void histTick;

  function writeDesign(next: RoofDesign) {
    const leadId = leadIdRef.current;
    if (!leadId) return;
    const synced = syncLegacy(next);
    setWorkspace((prev) => ({
      ...prev,
      designs: { ...prev.designs, [leadId]: { ...synced, updatedAt: nowIso() } },
      updatedAt: nowIso(),
    }));
  }

  function checkpoint() {
    const current = designRef.current;
    if (!current) return;
    pastRef.current = [...pastRef.current.slice(-48), cloneDesign(current)];
    futureRef.current = [];
    setHistTick((n) => n + 1);
  }

  function patch(partial: Partial<RoofDesign> | ((prev: RoofDesign) => RoofDesign), opts?: { record?: boolean }) {
    const current = designRef.current;
    if (!leadIdRef.current || !current) return;
    if (opts?.record !== false) checkpoint();
    const next = typeof partial === "function" ? partial(current) : { ...current, ...partial };
    writeDesign(next);
  }

  function undo() {
    const current = designRef.current;
    const prev = pastRef.current.pop();
    if (!current || !prev) return;
    futureRef.current = [...futureRef.current, cloneDesign(current)];
    setHistTick((n) => n + 1);
    writeDesign(prev);
    setSel(null);
  }

  function redo() {
    const current = designRef.current;
    const next = futureRef.current.pop();
    if (!current || !next) return;
    pastRef.current = [...pastRef.current, cloneDesign(current)];
    setHistTick((n) => n + 1);
    writeDesign(next);
    setSel(null);
  }

  function saveProposal() {
    if (!lead || !estimate || !live || !design) return;
    const fromModules = live.panelCount > 0;
    const systemKw = fromModules ? live.systemKw : estimate.systemKw;
    const panelCount = fromModules ? live.panelCount : estimate.panelCount;
    const notes = fromModules
      ? `${systemKw} kW · ${panelCount} modules · ${live.roofSqFt} ft² roof · ${estimate.offset}% offset · cash ${money(estimate.netPrice)}`
      : `${systemKw} kW estimated from bill · no modules placed · cash ${money(estimate.netPrice)}`;
    const snapshot: Proposal = {
      leadId: lead.id,
      status: "Internal review",
      version: (workspace.proposals?.[lead.id]?.version || 0) + 1,
      notes,
      updatedAt: nowIso(),
      customerName: lead.name,
      property: lead.property,
      utility: lead.utility,
      monthlyBill: lead.monthlyBill,
      panelWatts: design.panelWatts,
      panelCount,
      systemKw,
      roofSqFt: live.roofSqFt,
      coverage: live.coverage,
      offset: estimate.offset,
      annualProduction: estimate.annualProduction,
      annualUse: estimate.annualUse,
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
    setProposalOpen(true);
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
    const current = designRef.current;
    if (!current) return;
    const view = centerRef.current;
    const origin = { lat: current.lat || view.lat, lng: current.lng || view.lng };
    const bounds = siteBounds(current);
    const pad = 1.35;
    const spanFt = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 40) * pad;
    const mid = siteToLngLat(origin, bounds.cx, bounds.cy);
    let z = 19;
    if (spanFt > 220) z = 18;
    if (spanFt > 420) z = 17;
    if (spanFt > 800) z = 16;
    if (spanFt > 1500) z = 15;
    setCenter({ lat: mid.lat, lng: mid.lng });
    setZoom(z);
  }

  function setOriginFromView() {
    if (!leadIdRef.current) return;
    const view = centerRef.current;
    patch({ lat: view.lat, lng: view.lng });
    if (lead) log("lead", lead.id, "site_origin", `Site origin set to ${view.lat.toFixed(5)}, ${view.lng.toFixed(5)}`);
  }

  function moduleIdsFromSel(selection: CadSel) {
    if (selection?.kind !== "module") return [] as string[];
    return selection.ids?.length ? selection.ids : [selection.id];
  }

  const actionsRef = useRef({
    undo,
    redo,
    checkpoint,
    writeDesign,
    patch,
    fitSite,
    moduleIdsFromSel,
  });
  actionsRef.current = { undo, redo, checkpoint, writeDesign, patch, fitSite, moduleIdsFromSel };

  useEffect(() => {
    const typing = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (typing(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      const currentDesign = designRef.current;
      const currentSel = selRef.current;
      const currentTool = toolRef.current;
      const currentDraft = draftRef.current;
      const api = actionsRef.current;

      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        setSpacePan(true);
        return;
      }

      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) api.redo();
        else api.undo();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        api.redo();
        return;
      }

      if (event.key === "Escape") {
        setDraft([]);
        setSel(null);
        setTool("select");
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && currentTool === "draw" && currentDraft.length) {
        event.preventDefault();
        setDraft((prev) => prev.slice(0, -1));
        return;
      }

      if (event.key === "Enter" && currentTool === "draw" && currentDraft.length >= 3 && currentDesign) {
        event.preventDefault();
        api.checkpoint();
        const next: RoofFace = {
          id: uid("face"),
          points: currentDraft,
          pitchDeg: currentDesign.tiltDeg,
          azimuthDeg: currentDesign.azimuthDeg,
          heightFt: 12,
          material: currentDesign.roofMaterial,
          eligible: true,
        };
        api.writeDesign({ ...currentDesign, faces: [...(currentDesign.faces || []), next] });
        setDraft([]);
        setSel({ kind: "face", id: next.id });
        setTool("select");
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && currentSel && currentDesign) {
        event.preventDefault();
        if (currentSel.kind === "face") {
          api.patch({
            faces: (currentDesign.faces || []).filter((item) => item.id !== currentSel.id),
            modules: (currentDesign.modules || []).filter((item) => item.faceId !== currentSel.id),
          });
        } else if (currentSel.kind === "module") {
          const ids = new Set(api.moduleIdsFromSel(currentSel));
          api.patch({ modules: (currentDesign.modules || []).filter((item) => !ids.has(item.id)) });
        } else if (currentSel.kind === "obstruction") {
          api.patch({ obstructions: (currentDesign.obstructions || []).filter((item) => item.id !== currentSel.id) });
        }
        setSel(null);
        return;
      }

      if (event.key.toLowerCase() === "f" && !meta) {
        event.preventDefault();
        api.fitSite();
        return;
      }

      if ((event.key === "[" || event.key === "]") && currentSel?.kind === "module" && currentDesign) {
        event.preventDefault();
        const ids = new Set(api.moduleIdsFromSel(currentSel));
        const delta = event.key === "]" ? 90 : -90;
        api.patch({
          modules: (currentDesign.modules || []).map((row) =>
            ids.has(row.id) ? { ...row, rotationDeg: ((row.rotationDeg + delta) % 360 + 360) % 360 } : row,
          ),
        });
        return;
      }

      const key = event.key.toLowerCase();
      const toolMatch = TOOLS.find((item) => item.key.toLowerCase() === key);
      if (toolMatch && !meta) {
        event.preventDefault();
        setTool(toolMatch.id);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePan(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const address = lead ? lead.address || `${lead.property}, ${lead.city}` : "";
  const saved = lead ? workspace.proposals?.[lead.id] : undefined;
  const hint =
    activeTool === "draw"
      ? "Place vertices · Enter/double-click closes · Shift constrains ortho · snap to nearby points"
      : activeTool === "panel"
        ? "Click an eligible face to place a module · Shift+drag moves ortho"
        : activeTool === "measure"
          ? "Click two points for a length in feet"
          : activeTool === "vertex"
            ? "Drag vertices · Shift for ortho · snap to other corners"
            : activeTool === "pan" || spacePan
              ? "Drag the map · scroll to zoom · release Space to return"
              : "Select geometry · Shift+click adds modules · Delete removes · Space pans";

  if (loading || !lead || !design || !estimate || !live) return <div className="text-[var(--muted)]">Loading design…</div>;

  return (
    <div className="cad-desk">
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
          <button type="button" className="az-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button type="button" className="az-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)">
            Redo
          </button>
          <button type="button" className="az-btn" onClick={() => setKind((k) => (k === "satellite" ? "streets" : "satellite"))}>
            {kind === "satellite" ? "Satellite" : "Streets"}
          </button>
          <button type="button" className="az-btn" onClick={fitSite} title="Fit (F)">
            Fit
          </button>
          <button type="button" className="az-btn" onClick={setOriginFromView}>
            Set origin
          </button>
          <button type="button" className="az-btn pri" onClick={saveProposal}>
            Save proposal v{(saved?.version || 0) + 1}
          </button>
        </div>
      </header>

      <div className="cad-body">
        <aside className="cad-tools" aria-label="Design tools">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeTool === item.id ? "on" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setTool(item.id)}
              title={`${item.label} (${item.key})`}
            >
              <span className="cad-tool-label">{item.label}</span>
              <kbd>{item.key}</kbd>
            </button>
          ))}
        </aside>

        <div className="cad-canvas">
          <TileMap lat={center.lat} lng={center.lng} zoom={zoom} kind={kind} onMove={(next) => { setCenter({ lat: next.lat, lng: next.lng }); setZoom(next.zoom); }}>
            {(view) => (
              <SiteCanvas
                design={design}
                view={view}
                tool={activeTool}
                sel={sel}
                onSel={setSel}
                onChange={(next) => writeDesign(next)}
                onGestureStart={checkpoint}
                draft={draft}
                onDraft={setDraft}
              />
            )}
          </TileMap>
          <div className="cad-hint">{hint}</div>
        </div>

        <aside className="cad-inspector">
          <div className="cad-insp-block cad-sys-strip">
            <div className="cad-metrics cad-metrics-tight">
              <div>
                <span>Modules</span>
                <b className="az-num">{live.panelCount || "—"}</b>
              </div>
              <div>
                <span>DC</span>
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
                <span>Coverage</span>
                <b className="az-num">{live.panelCount ? `${live.coverage}%` : "—"}</b>
              </div>
              <div>
                <span>Year-1*</span>
                <b className="az-num">{estimate.annualProduction.toLocaleString()} kWh</b>
              </div>
            </div>
            <p className="cad-note">
              {live.panelCount
                ? `Array from placed modules · *Year-1 uses ${design.shadeLoss}% assumed shade + city sun hours (not a shade sim).`
                : `No modules — plan size ${estimate.systemKw} kW / ${estimate.panelCount} mod is bill-based, not surveyed.`}
            </p>
          </div>

          {face ? (
            <FaceInspector
              face={face}
              sel={sel}
              onFace={(next) => patch({ faces: (design.faces || []).map((item) => (item.id === face.id ? next : item)) })}
              onFill={() => patch({ modules: fillFace(face, design, design.modules || []) })}
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
              ids={moduleIdsFromSel(sel)}
              onChange={(ids, mapFn) =>
                patch({
                  modules: (design.modules || []).map((row) => (ids.includes(row.id) ? mapFn(row) : row)),
                })
              }
              onDelete={(ids) => patch({ modules: (design.modules || []).filter((row) => !ids.includes(row.id)) })}
            />
          ) : null}

          {sel?.kind === "obstruction" ? (
            <ObstructionInspector
              item={(design.obstructions || []).find((row) => row.id === sel.id)}
              onChange={(next) => patch({ obstructions: (design.obstructions || []).map((row) => (row.id === next.id ? next : row)) })}
              onDelete={() => patch({ obstructions: (design.obstructions || []).filter((row) => row.id !== sel.id) })}
            />
          ) : null}

          {!sel ? (
            <div className="cad-insp-block">
              <div className="az-kicker">Site defaults</div>
              <div className="cad-field-grid">
                <label>
                  Setback ft
                  <input
                    className="az-input"
                    type="number"
                    step="0.5"
                    value={design.setbackFt ?? 3}
                    onChange={(event) => patch({ setbackFt: Number(event.target.value) || 0 })}
                  />
                </label>
                <label>
                  Shade %*
                  <input
                    className="az-input"
                    type="number"
                    value={design.shadeLoss}
                    onChange={(event) => patch({ shadeLoss: Number(event.target.value) })}
                  />
                </label>
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
                  Gap in
                  <input
                    className="az-input"
                    type="number"
                    step="0.1"
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
              <p className="cad-note">Setback is a design offset for fill — not an AHJ check. Shade % is assumed.</p>
            </div>
          ) : null}

          <details className="cad-prop-fold" open={proposalOpen} onToggle={(event) => setProposalOpen((event.target as HTMLDetailsElement).open)}>
            <summary>
              <span className="cad-prop-title">Proposal</span>
              <span className="cad-prop-meta">{saved ? `v${saved.version} · ${saved.status}` : "unsaved"}</span>
            </summary>
            <div className="cad-insp-block prop-insp">
              <ProposalFlow
                lead={lead}
                design={design}
                estimate={estimate}
                live={live}
                saved={saved}
                onSave={saveProposal}
                onMarkPresented={markPresented}
              />
            </div>
          </details>
        </aside>
      </div>

      <footer className="cad-status">
        <span>
          {compassLabel(design.azimuthDeg)} {design.azimuthDeg}° · pitch {design.tiltDeg}°
        </span>
        <span>
          {live.panelCount ? `${live.panelCount} mod · ${live.systemKw} kW · ${live.panelSqFt} ft² panels` : "No modules"}
        </span>
        <span>
          Roof {live.roofSqFt} ft² · usable ~{live.usableSqFt} ft² · setback {design.setbackFt ?? 3} ft
        </span>
        <span>{kind === "satellite" ? "Esri imagery" : "OSM streets"} · z{zoom.toFixed(1)}</span>
      </footer>
    </div>
  );
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
  onFill: () => void;
  onRotate: () => void;
  onCopy: () => void;
}) {
  const area = Math.round(polygonArea(face.points));
  const lengths = edgeLengths(face.points);
  const edgeLen = sel?.kind === "edge" ? lengths[sel.index] : null;
  const [edgeText, setEdgeText] = useState(edgeLen != null ? formatFeet(edgeLen) : "");

  useEffect(() => {
    if (edgeLen != null) setEdgeText(formatFeet(edgeLen));
  }, [face.id, sel?.kind === "edge" ? sel.index : -1, edgeLen]);

  function commitEdge() {
    if (edgeLen == null || sel?.kind !== "edge") return;
    const next = parseFeetInches(edgeText);
    if (next == null) {
      setEdgeText(formatFeet(edgeLen));
      return;
    }
    const a = face.points[sel.index];
    const b = face.points[(sel.index + 1) % face.points.length];
    const cur = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const scale = next / cur;
    const points = face.points.map((pt, i) =>
      i === (sel.index + 1) % face.points.length ? { x: a.x + (b.x - a.x) * scale, y: a.y + (b.y - a.y) * scale } : pt,
    );
    onFace({ ...face, points });
  }

  return (
    <div className="cad-insp-block">
      <div className="az-kicker">Roof face</div>
      <div className="cad-metrics cad-metrics-tight">
        <div>
          <span>Area</span>
          <b>{area} ft²</b>
        </div>
        <div>
          <span>Azimuth</span>
          <b>
            {face.azimuthDeg}° {compassLabel(face.azimuthDeg)}
          </b>
        </div>
      </div>
      <div className="cad-field-grid">
        <label>
          Pitch °
          <input className="az-input" type="number" value={face.pitchDeg} onChange={(event) => onFace({ ...face, pitchDeg: Number(event.target.value) })} />
        </label>
        <label>
          Azimuth °
          <input className="az-input" type="number" value={face.azimuthDeg} onChange={(event) => onFace({ ...face, azimuthDeg: Number(event.target.value) })} />
        </label>
        <label>
          Height ft
          <input className="az-input" type="number" value={face.heightFt} onChange={(event) => onFace({ ...face, heightFt: Number(event.target.value) })} />
        </label>
        <label>
          Material
          <input className="az-input" value={face.material} onChange={(event) => onFace({ ...face, material: event.target.value })} />
        </label>
      </div>
      <label className="cad-check">
        <input
          type="checkbox"
          checked={face.eligible !== false}
          onChange={(event) => onFace({ ...face, eligible: event.target.checked })}
        />
        Panel-eligible
      </label>
      {edgeLen != null ? (
        <label>
          Edge length
          <input
            className="az-input"
            value={edgeText}
            onChange={(event) => setEdgeText(event.target.value)}
            onBlur={commitEdge}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                (event.target as HTMLInputElement).blur();
              }
            }}
          />
        </label>
      ) : null}
      <div className="cad-action-row">
        <button type="button" className="az-btn pri" onClick={onFill} disabled={face.eligible === false}>
          Auto-fill
        </button>
        <button type="button" className="az-btn" onClick={onRotate}>
          Rotate 15°
        </button>
        <button type="button" className="az-btn" onClick={onCopy}>
          Copy
        </button>
      </div>
      <p className="cad-note">Select an edge to type exact length (Enter). Auto-fill respects setback + obstructions.</p>
    </div>
  );
}

function ModuleInspector({
  design,
  ids,
  onChange,
  onDelete,
}: {
  design: RoofDesign;
  ids: string[];
  onChange: (ids: string[], mapFn: (mod: import("@/lib/types").PlacedModule) => import("@/lib/types").PlacedModule) => void;
  onDelete: (ids: string[]) => void;
}) {
  const mods = (design.modules || []).filter((row) => ids.includes(row.id));
  if (!mods.length) return null;
  const mod = mods[0];
  const multi = mods.length > 1;
  const portrait = mod.portrait !== false;
  const w = portrait ? design.panelWidthIn ?? 41 : design.panelHeightIn ?? 74;
  const h = portrait ? design.panelHeightIn ?? 74 : design.panelWidthIn ?? 41;
  return (
    <div className="cad-insp-block">
      <div className="az-kicker">{multi ? `${mods.length} modules` : "Module"}</div>
      <p className="cad-note">
        {w}&quot; × {h}&quot; · {design.panelWatts}W · {portrait ? "portrait" : "landscape"}
        {multi ? " · edits apply to selection" : ""}
      </p>
      {!multi ? (
        <label>
          Rotation °
          <input
            className="az-input"
            type="number"
            value={mod.rotationDeg}
            onChange={(event) => onChange(ids, (row) => ({ ...row, rotationDeg: Number(event.target.value) }))}
          />
        </label>
      ) : null}
      <div className="cad-action-row">
        <button type="button" className={`az-btn ${portrait ? "pri" : ""}`} onClick={() => onChange(ids, (row) => ({ ...row, portrait: true }))}>
          Portrait
        </button>
        <button type="button" className={`az-btn ${!portrait ? "pri" : ""}`} onClick={() => onChange(ids, (row) => ({ ...row, portrait: false }))}>
          Landscape
        </button>
        <button
          type="button"
          className="az-btn"
          onClick={() => onChange(ids, (row) => ({ ...row, rotationDeg: (row.rotationDeg + 90) % 360 }))}
          title="] also rotates"
        >
          Rotate 90°
        </button>
        <button type="button" className="az-btn" onClick={() => onDelete(ids)}>
          Delete
        </button>
      </div>
      <p className="cad-note">Drag to move · Shift constrains ortho · [ / ] rotate 90°.</p>
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
      <div className="cad-field-grid">
        {(["widthFt", "lengthFt", "heightFt"] as const).map((key) => (
          <label key={key}>
            {key.replace("Ft", " ft")}
            <input
              className="az-input"
              type="number"
              value={item[key]}
              onChange={(event) => onChange({ ...item, [key]: Number(event.target.value) })}
            />
          </label>
        ))}
      </div>
      <button type="button" className="az-btn" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
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

const TOOLS: { id: CadTool; label: string }[] = [
  { id: "pan", label: "Pan" },
  { id: "select", label: "Select" },
  { id: "draw", label: "Roof" },
  { id: "vertex", label: "Vertex" },
  { id: "panel", label: "Panel" },
  { id: "gear", label: "Obstruction" },
  { id: "tree", label: "Tree" },
  { id: "measure", label: "Measure" },
];

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

  useEffect(() => {
    if (!raw) return;
    const lat = raw.lat || coordsFor(lead?.city || "", lead?.id || "").lat;
    const lng = raw.lng || coordsFor(lead?.city || "", lead?.id || "").lng;
    setCenter({ lat, lng });
    setZoom(19);
    setSel(null);
    setDraft([]);
  }, [lead?.id]);

  const design = raw;
  const estimate = lead && design ? estimateFor(lead, design) : null;
  const live = design ? liveMetrics(design) : null;
  const face = design && (sel?.kind === "face" || sel?.kind === "vertex" || sel?.kind === "edge")
    ? (design.faces || []).find((item) => item.id === sel.id)
    : null;

  function patch(partial: Partial<RoofDesign> | ((prev: RoofDesign) => RoofDesign)) {
    if (!lead || !design) return;
    const next = syncLegacy(typeof partial === "function" ? partial(design) : { ...design, ...partial });
    setWorkspace((prev) => ({
      ...prev,
      designs: { ...prev.designs, [lead.id]: { ...next, updatedAt: nowIso() } },
      updatedAt: nowIso(),
    }));
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
    const bounds = siteBounds(design);
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
    if (!lead) return;
    patch({ lat: center.lat, lng: center.lng });
    log("lead", lead.id, "site_origin", `Site origin set to ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft([]);
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
        };
        patch({ faces: [...(design.faces || []), next] });
        setDraft([]);
        setSel({ kind: "face", id: next.id });
      }
      if ((event.key === "Backspace" || event.key === "Delete") && sel && design) {
        if (sel.kind === "face") {
          patch({
            faces: (design.faces || []).filter((item) => item.id !== sel.id),
            modules: (design.modules || []).filter((item) => item.faceId !== sel.id),
          });
        }
        if (sel.kind === "module") patch({ modules: (design.modules || []).filter((item) => item.id !== sel.id) });
        if (sel.kind === "obstruction") patch({ obstructions: (design.obstructions || []).filter((item) => item.id !== sel.id) });
        setSel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, draft, sel, design]);

  const address = lead ? lead.address || `${lead.property}, ${lead.city}` : "";

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
          <button type="button" className="az-btn" onClick={() => setKind((k) => (k === "satellite" ? "streets" : "satellite"))}>
            {kind === "satellite" ? "Satellite" : "Streets"}
          </button>
          <button type="button" className="az-btn" onClick={fitSite}>
            Fit
          </button>
          <button type="button" className="az-btn" onClick={setOriginFromView}>
            Set origin
          </button>
          <button type="button" className="az-btn pri" onClick={saveProposal}>
            Save proposal v{(workspace.proposals?.[lead.id]?.version || 0) + 1}
          </button>
        </div>
      </header>

      <div className="cad-body">
        <aside className="cad-tools">
          {TOOLS.map((item) => (
            <button key={item.id} type="button" className={tool === item.id ? "on" : ""} onClick={() => setTool(item.id)} title={item.label}>
              {item.label}
            </button>
          ))}
        </aside>

        <div className="cad-canvas">
          <TileMap lat={center.lat} lng={center.lng} zoom={zoom} kind={kind} onMove={(next) => { setCenter({ lat: next.lat, lng: next.lng }); setZoom(next.zoom); }}>
            {(view) => (
              <SiteCanvas
                design={design}
                view={view}
                tool={tool}
                sel={sel}
                onSel={setSel}
                onChange={(next) => patch(() => next)}
                draft={draft}
                onDraft={setDraft}
              />
            )}
          </TileMap>
          <div className="cad-hint">
            {tool === "draw"
              ? "Click to place vertices. Enter or double-click to close the roof face."
              : tool === "panel"
                ? "Click inside a roof face to place a module at real 425W dimensions."
                : tool === "measure"
                  ? "Click two points. Length is in feet."
                  : "Select geometry. Inspector on the right. Delete removes the selection."}
          </div>
        </div>

        <aside className="cad-inspector">
          <div className="cad-insp-block">
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
                <span>Coverage</span>
                <b className="az-num">{live.panelCount ? `${live.coverage}%` : "—"}</b>
              </div>
            </div>
            {!live.panelCount ? (
              <p className="cad-note">No modules placed. Size below is a bill-based planning estimate, not a surveyed array.</p>
            ) : null}
            <div className="cad-metrics faint">
              <div>
                <span>Plan size</span>
                <b>{estimate.systemKw} kW</b>
              </div>
              <div>
                <span>Year-1 est.</span>
                <b>{estimate.annualProduction.toLocaleString()} kWh</b>
              </div>
            </div>
            <p className="cad-note">Year-1 uses assumed shade loss ({design.shadeLoss}%) and city sun hours — not a shade simulation.</p>
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
            <div className="cad-insp-block">
              <div className="az-kicker">Module</div>
              <p className="cad-note">
                {(design.panelWidthIn ?? 41)}&quot; × {(design.panelHeightIn ?? 74)}&quot; · {design.panelWatts}W
              </p>
              <button type="button" className="az-btn" onClick={() => patch({ modules: (design.modules || []).filter((item) => item.id !== sel.id) })}>
                Delete module
              </button>
            </div>
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
              <div className="az-kicker">Site</div>
              <label>
                Setback
                <input
                  className="az-input"
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
              <label>
                Module watts
                <input
                  className="az-input"
                  type="number"
                  value={design.panelWatts}
                  onChange={(event) => patch({ panelWatts: Number(event.target.value) })}
                />
              </label>
              <p className="cad-note">Fire pathways and AHJ setbacks are a configurable offset, not a code check.</p>
            </div>
          ) : null}

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
        </aside>
      </div>

      <footer className="cad-status">
        <span>{compassLabel(design.azimuthDeg)} {design.azimuthDeg}°</span>
        <span>Pitch {design.tiltDeg}°</span>
        <span>Setback {design.setbackFt ?? 3} ft</span>
        <span>{kind === "satellite" ? "Esri imagery" : "OSM streets"}</span>
        <span>z{zoom.toFixed(1)}</span>
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
      <label>
        Material
        <input className="az-input" value={face.material} onChange={(event) => onFace({ ...face, material: event.target.value })} />
      </label>
      {edgeLen != null ? (
        <label>
          Edge length
          <input
            className="az-input"
            defaultValue={formatFeet(edgeLen)}
            onBlur={(event) => {
              const next = parseFeetInches(event.target.value);
              if (next == null) return;
              const a = face.points[sel!.kind === "edge" ? sel!.index : 0];
              const b = face.points[((sel!.kind === "edge" ? sel!.index : 0) + 1) % face.points.length];
              const cur = Math.hypot(b.x - a.x, b.y - a.y) || 1;
              const scale = next / cur;
              const points = face.points.map((pt, i) => (i === ((sel as { index: number }).index + 1) % face.points.length ? { x: a.x + (b.x - a.x) * scale, y: a.y + (b.y - a.y) * scale } : pt));
              onFace({ ...face, points });
            }}
          />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button" className="az-btn pri" onClick={onFill}>
          Auto-fill
        </button>
        <button type="button" className="az-btn" onClick={onRotate}>
          Rotate 15°
        </button>
        <button type="button" className="az-btn" onClick={onCopy}>
          Copy
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

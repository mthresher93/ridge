"use client";

import { useMemo, useState } from "react";
import { money, nowIso, uid } from "@/lib/format";
import type { CargoUnit, Shipment, ShipmentStatus, Workspace } from "@/lib/types";
import { convertQuoteToLoad, recordTracking, TRACKING_KINDS } from "@/lib/ops";
import { parseMoney, SHIPMENT_STATUSES } from "@/lib/validate";
import { attachCarrierToShipment, carrierLabel, extractCarrierFacts, ingestCarrier } from "@/lib/carriers";
import { classifyWhy } from "@/lib/load-class";
import { combineUnits } from "@/lib/freight-math";
import { parseDimensions, parsePounds, recommendEquipment } from "@/lib/equipment";
import { useWorkspace } from "@/lib/workspace-context";
import { shipmentMargin } from "@/lib/freight";

type Tab = "overview" | "quote" | "carrier" | "tracking" | "money" | "log";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "quote", label: "Lane / cargo" },
  { id: "carrier", label: "Carrier" },
  { id: "tracking", label: "Tracking" },
  { id: "money", label: "Financials" },
  { id: "log", label: "Activity" },
];

export function LoadOpsPane({
  shipment,
  onChange,
  onClose,
}: {
  shipment: Shipment;
  onChange: (next: Shipment, workspace?: Workspace) => void;
  onClose?: () => void;
}) {
  const { workspace, setWorkspace, log } = useWorkspace();
  const [tab, setTab] = useState<Tab>(shipment.status === "Quote" ? "quote" : "overview");
  const [msg, setMsg] = useState("");
  const [paste, setPaste] = useState("");
  const [url, setUrl] = useState("");
  const draft = shipment;
  const activities = useMemo(
    () =>
      (workspace.activities || [])
        .filter((item) => item.entityId === draft.id || item.entityId === draft.leadId)
        .slice(0, 20),
    [workspace.activities, draft.id, draft.leadId],
  );
  const fit = recommendEquipment({
    text: draft.commodity,
    dimensions: draft.dimensions,
    weight: draft.weight,
  });
  const parsed = parseDimensions(draft.dimensions || "");
  const klass = classifyWhy(
    parsed.lengthFt,
    parsePounds(draft.weight),
    /hot\s*shot/i.test(draft.equipmentType) ? "hotshot" : "53",
  );
  const units = draft.cargoUnits || [];
  const combined = units.length >= 2
    ? combineUnits(
        units.map((item) => ({
          lengthFt: item.lengthFt || 0,
          widthFt: item.widthFt || 0,
          heightFt: item.heightFt || 0,
          weightLbs: item.weightLbs || 0,
        })),
        "end-to-end",
      )
    : null;

  function patch(partial: Partial<Shipment>) {
    const next = { ...draft, ...partial, updatedAt: nowIso() };
    onChange(next);
    setWorkspace((prev) => ({
      ...prev,
      shipments: (prev.shipments || []).map((row) => (row.id === next.id ? next : row)),
      updatedAt: next.updatedAt,
    }));
  }

  function saveRates() {
    const customerRate = parseMoney(draft.customerRate);
    const carrierRate = parseMoney(draft.carrierRate);
    if (customerRate == null || carrierRate == null) {
      setMsg("Rates must be numbers. Leave 0 until you have a real number.");
      return;
    }
    setWorkspace((prev) => ({
      ...prev,
      shipments: (prev.shipments || []).map((row) => (row.id === draft.id ? { ...draft, customerRate, carrierRate, updatedAt: nowIso() } : row)),
      updatedAt: nowIso(),
    }));
    setMsg("Saved.");
    log("shipment", draft.id, "updated", draft.status);
  }

  function convert() {
    const result = convertQuoteToLoad(workspace, draft.id);
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    setWorkspace(result.workspace);
    onChange(result.shipment, result.workspace);
    setMsg(`${result.shipment.loadNumber} is a load.`);
    log("shipment", result.shipment.id, "converted", result.shipment.loadNumber || "");
  }

  function track(kind: (typeof TRACKING_KINDS)[number]) {
    const result = recordTracking(workspace, draft.id, kind);
    if (!result.ok) {
      setMsg(result.error);
      return;
    }
    setWorkspace(result.workspace);
    onChange(result.shipment, result.workspace);
    setMsg(kind);
    log("shipment", result.shipment.id, "tracking", kind);
  }

  function saveCarrier() {
    const facts = extractCarrierFacts(paste, url);
    if (!facts.mc && !facts.dot && !facts.phone) {
      setMsg("Need an MC, DOT, or published local phone. Do not invent one.");
      return;
    }
    const result = ingestCarrier(workspace, facts);
    const attached = attachCarrierToShipment(draft, result.carrier);
    setWorkspace({
      ...result.workspace,
      shipments: (result.workspace.shipments || []).map((row) => (row.id === draft.id ? attached : row)),
    });
    onChange(attached, result.workspace);
    setMsg(`Cover: ${carrierLabel(result.carrier)}`);
    setPaste("");
  }

  function patchUnits(units: CargoUnit[]) {
    const mapped = units
      .filter((item) => (item.lengthFt || 0) > 0 || (item.weightLbs || 0) > 0)
      .map((item) => ({
        lengthFt: item.lengthFt || 0,
        widthFt: item.widthFt || 0,
        heightFt: item.heightFt || 0,
        weightLbs: item.weightLbs || 0,
      }));
    const combined = mapped.length ? combineUnits(mapped, "end-to-end") : null;
    patch({
      cargoUnits: units,
      ...(combined
        ? { dimensions: `${combined.lengthFt} x ${combined.widthFt} x ${combined.heightFt}`, weight: String(combined.weightLbs) }
        : {}),
    });
  }

  const margin = shipmentMargin(Number(draft.customerRate) || 0, Number(draft.carrierRate) || 0);
  const attached = (workspace.carriers || []).find((item) => item.id === draft.carrierId);

  return (
    <section className="load-ops">
      <header className="load-ops-head">
        <div>
          <div className="home-kicker">{draft.status}</div>
          <h2>{draft.loadNumber || "Quote"}</h2>
          <p>
            {draft.customer} · {draft.origin || "—"} → {draft.destination || "—"} · {draft.equipmentType || "no deck"}
          </p>
        </div>
        <div className="load-ops-money">
          <b>{draft.customerRate || draft.carrierRate ? money(margin) : "—"}</b>
          <span>gross margin</span>
          {onClose ? (
            <button className="az-btn sm" type="button" onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>
      </header>
      <nav className="load-ops-tabs">
        {TABS.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="load-ops-pane">
        {msg ? <p className="cd-mono">{msg}</p> : null}
        {tab === "overview" ? (
          <div className="load-ops-grid">
            <p className="cd-mono">{klass.why}</p>
            <p className="cd-mono">
              {fit.trailerName} · {fit.loadClass}. {fit.why}
            </p>
            {draft.appointmentPickup ? <p className="rec-warn">Pickup appointment required.</p> : null}
            {draft.status === "Quote" ? (
              <button className="az-btn pri sm" type="button" onClick={convert}>
                Customer accepted — open load
              </button>
            ) : null}
            <label className="rec-field">
              Status
              <select className="az-select" value={draft.status} onChange={(event) => patch({ status: event.target.value as ShipmentStatus })}>
                {SHIPMENT_STATUSES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <button className="az-btn sm" type="button" onClick={saveRates}>
              Save header
            </button>
          </div>
        ) : null}
        {tab === "quote" ? (
          <div className="rec-form">
            <div className="rec-grid">
              <label className="rec-field">
                Origin
                <input className="az-input" value={draft.origin} onChange={(event) => patch({ origin: event.target.value })} />
              </label>
              <label className="rec-field">
                Destination
                <input className="az-input" value={draft.destination} onChange={(event) => patch({ destination: event.target.value })} />
              </label>
            </div>
            <div className="rec-grid">
              <label className="rec-field">
                Pickup notes
                <input className="az-input" value={draft.pickupNotes || ""} onChange={(event) => patch({ pickupNotes: event.target.value })} />
              </label>
              <label className="rec-field">
                Delivery notes
                <input className="az-input" value={draft.destNotes || ""} onChange={(event) => patch({ destNotes: event.target.value })} />
              </label>
            </div>
            <label className="rec-field">
              <input
                type="checkbox"
                checked={Boolean(draft.appointmentPickup)}
                onChange={(event) => patch({ appointmentPickup: event.target.checked })}
              />{" "}
              Pickup appointment required
            </label>
            <div className="rec-grid">
              <label className="rec-field">
                Dims L × W × H
                <input className="az-input" value={draft.dimensions} onChange={(event) => patch({ dimensions: event.target.value })} />
              </label>
              <label className="rec-field">
                Weight
                <input className="az-input" value={draft.weight} onChange={(event) => patch({ weight: event.target.value })} />
              </label>
            </div>
            <div className="cargo-units">
              <div className="home-kicker">Cargo units</div>
              {(draft.cargoUnits || []).map((unit, index) => (
                <div key={unit.id} className="rec-grid">
                  <label className="rec-field">
                    L ft
                    <input
                      className="az-input"
                      type="number"
                      min={0}
                      value={unit.lengthFt ?? ""}
                      onChange={(event) => {
                        const next = [...(draft.cargoUnits || [])];
                        next[index] = { ...unit, lengthFt: event.target.value === "" ? null : Number(event.target.value) };
                        patchUnits(next);
                      }}
                    />
                  </label>
                  <label className="rec-field">
                    W ft
                    <input
                      className="az-input"
                      type="number"
                      min={0}
                      value={unit.widthFt ?? ""}
                      onChange={(event) => {
                        const next = [...(draft.cargoUnits || [])];
                        next[index] = { ...unit, widthFt: event.target.value === "" ? null : Number(event.target.value) };
                        patchUnits(next);
                      }}
                    />
                  </label>
                  <label className="rec-field">
                    H ft
                    <input
                      className="az-input"
                      type="number"
                      min={0}
                      value={unit.heightFt ?? ""}
                      onChange={(event) => {
                        const next = [...(draft.cargoUnits || [])];
                        next[index] = { ...unit, heightFt: event.target.value === "" ? null : Number(event.target.value) };
                        patchUnits(next);
                      }}
                    />
                  </label>
                  <label className="rec-field">
                    lb
                    <input
                      className="az-input"
                      type="number"
                      min={0}
                      value={unit.weightLbs ?? ""}
                      onChange={(event) => {
                        const next = [...(draft.cargoUnits || [])];
                        next[index] = { ...unit, weightLbs: event.target.value === "" ? null : Number(event.target.value) };
                        patchUnits(next);
                      }}
                    />
                  </label>
                </div>
              ))}
              <button
                className="az-btn sm"
                type="button"
                onClick={() =>
                  patchUnits([
                    ...(draft.cargoUnits || []),
                    { id: uid("cu"), qty: 1, lengthFt: null, widthFt: null, heightFt: null, weightLbs: null, notes: "" },
                  ])
                }
              >
                Add unit
              </button>
            </div>
            <label className="rec-field">
              Equipment
              <input className="az-input" value={draft.equipmentType} onChange={(event) => patch({ equipmentType: event.target.value })} />
            </label>
            <p className="cd-mono">
              Recommended: {fit.trailerName}. Possible: {fit.alsoFits.length ? fit.alsoFits.join(", ") : "—"}. {fit.legalNote}
            </p>
            {combined ? (
              <p className="cd-mono">
                Combined units end-to-end: {combined.lengthFt}' × {combined.widthFt}' × {combined.heightFt}' · {combined.weightLbs.toLocaleString()} lb
              </p>
            ) : null}
            <div className="rec-grid">
              <label className="rec-field">
                Pickup
                <input className="az-input" type="date" value={draft.pickupDate} onChange={(event) => patch({ pickupDate: event.target.value })} />
              </label>
              <label className="rec-field">
                Delivery
                <input className="az-input" type="date" value={draft.deliveryDate} onChange={(event) => patch({ deliveryDate: event.target.value })} />
              </label>
            </div>
            <button className="az-btn pri sm" type="button" onClick={saveRates}>
              Save lane
            </button>
          </div>
        ) : null}
        {tab === "carrier" ? (
          <div className="rec-form">
            <p className="cd-mono">{attached ? carrierLabel(attached) : draft.carrier || "No carrier on file."}</p>
            <textarea className="az-area" rows={4} value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Paste FMCSA or their site." />
            <input className="az-input" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Page URL (optional)" />
            <button className="az-btn pri sm" type="button" onClick={saveCarrier}>
              Save and attach
            </button>
            <label className="rec-field">
              Carrier on file
              <select
                className="az-select"
                value={draft.carrierId || ""}
                onChange={(event) => {
                  const picked = (workspace.carriers || []).find((item) => item.id === event.target.value);
                  if (!picked) {
                    patch({ carrierId: "", carrier: "" });
                    return;
                  }
                  patch(attachCarrierToShipment(draft, picked));
                }}
              >
                <option value="">None</option>
                {(workspace.carriers || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {carrierLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {tab === "tracking" ? (
          <div>
            {draft.status === "Quote" ? <p className="cd-mono">Convert the quote before tracking.</p> : null}
            <div className="desk-next-actions">
              {TRACKING_KINDS.map((kind) => (
                <button key={kind} className="az-btn sm" type="button" disabled={draft.status === "Quote"} onClick={() => track(kind)}>
                  {kind}
                </button>
              ))}
            </div>
            <ol className="track-log">
              {(draft.tracking || [])
                .slice()
                .reverse()
                .map((item) => (
                  <li key={item.id}>
                    <b>{item.kind}</b>
                    <span>{item.at.slice(0, 16).replace("T", " ")}</span>
                  </li>
                ))}
            </ol>
          </div>
        ) : null}
        {tab === "money" ? (
          <div className="rec-form">
            <div className="rec-grid">
              <label className="rec-field">
                Customer rate
                <input
                  className="az-input"
                  type="number"
                  min={0}
                  value={draft.customerRate || ""}
                  onChange={(event) => patch({ customerRate: event.target.value === "" ? 0 : Number(event.target.value) })}
                />
              </label>
              <label className="rec-field">
                Carrier pay
                <input
                  className="az-input"
                  type="number"
                  min={0}
                  value={draft.carrierRate || ""}
                  onChange={(event) => patch({ carrierRate: event.target.value === "" ? 0 : Number(event.target.value) })}
                />
              </label>
            </div>
            <p className="cd-mono">
              {draft.customerRate || draft.carrierRate ? `Margin ${money(margin)}` : "Leave blank until they give you a number. Listing ask is not the rate."}
            </p>
            <button className="az-btn pri sm" type="button" onClick={saveRates}>
              Save rates
            </button>
          </div>
        ) : null}
        {tab === "log" ? (
          <ol className="track-log">
            {(draft.tracking || []).map((item) => (
              <li key={item.id}>
                <b>{item.kind}</b>
                <span>{item.note || item.at.slice(0, 16)}</span>
              </li>
            ))}
            {activities.map((item) => (
              <li key={item.id}>
                <b>{item.type}</b>
                <span>{item.detail}</span>
              </li>
            ))}
            {!draft.tracking?.length && !activities.length ? <p className="cd-mono">No events yet.</p> : null}
          </ol>
        ) : null}
      </div>
    </section>
  );
}

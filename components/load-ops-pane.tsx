"use client";

import { useEffect, useMemo, useState } from "react";
import { money, nowIso, uid } from "@/lib/format";
import type { CargoUnit, Shipment, ShipmentStatus, Workspace } from "@/lib/types";
import { convertQuoteToLoad, recordTracking, TRACKING_KINDS } from "@/lib/ops";
import { parseMoney, SHIPMENT_STATUSES } from "@/lib/validate";
import { attachCarrierToShipment, carrierLabel, extractCarrierFacts, ingestCarrier } from "@/lib/carriers";
import { classifyWhy } from "@/lib/load-class";
import { combineUnits } from "@/lib/freight-math";
import { measuredDimensions, parseDimensions, parsePounds, recommendEquipment } from "@/lib/equipment";
import { useWorkspace } from "@/lib/workspace-context";
import { joinLanePlace, parseMeasure, shipmentMargin, splitLanePlace } from "@/lib/freight";

type Tab = "overview" | "quote" | "carrier" | "tracking" | "money" | "log";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "quote", label: "Lane" },
  { id: "carrier", label: "Carrier" },
  { id: "tracking", label: "Tracking" },
  { id: "money", label: "Financials" },
  { id: "log", label: "Activity" },
];

function blankRate(value: number | string | null | undefined) {
  if (value == null || value === "" || Number(value) === 0) return "";
  return String(value);
}

function laneFromShipment(shipment: Shipment) {
  const origin = splitLanePlace(shipment.origin || "");
  const dest = splitLanePlace(shipment.destination || "");
  const parsed = parseDimensions(shipment.dimensions || "");
  const unit = shipment.cargoUnits?.[0];
  return {
    originCity: origin.city,
    originState: origin.state,
    destCity: dest.city,
    destState: dest.state,
    pickupDate: shipment.pickupDate || "",
    deliveryDate: shipment.deliveryDate || "",
    pickupNotes: shipment.pickupNotes || "",
    destNotes: shipment.destNotes || "",
    appointmentPickup: Boolean(shipment.appointmentPickup),
    length: unit?.lengthFt != null ? String(unit.lengthFt) : parsed.lengthFt != null ? String(parsed.lengthFt) : "",
    width: unit?.widthFt != null ? String(unit.widthFt) : parsed.widthFt != null ? String(parsed.widthFt) : "",
    height: unit?.heightFt != null ? String(unit.heightFt) : parsed.heightFt != null ? String(parsed.heightFt) : "",
    weight: unit?.weightLbs != null ? String(unit.weightLbs) : shipment.weight || "",
    commodity: shipment.commodity || "",
    equipmentType: shipment.equipmentType || "",
    customerRate: blankRate(shipment.customerRate),
    carrierRate: blankRate(shipment.carrierRate),
  };
}

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
  const [lane, setLane] = useState(() => laneFromShipment(shipment));
  const draft = shipment;

  useEffect(() => {
    setLane(laneFromShipment(shipment));
  }, [shipment.id]);
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
  const laneFit = recommendEquipment({
    text: lane.commodity || lane.equipmentType,
    lengthFt: parseMeasure(lane.length),
    widthFt: parseMeasure(lane.width),
    heightFt: parseMeasure(lane.height),
    weightLbs: parseMeasure(lane.weight),
  });
  const laneMargin = shipmentMargin(Number(lane.customerRate) || 0, Number(lane.carrierRate) || 0);
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
    const customerRate = parseMoney(lane.customerRate === "" ? 0 : lane.customerRate);
    const carrierRate = parseMoney(lane.carrierRate === "" ? 0 : lane.carrierRate);
    if (customerRate == null || carrierRate == null) {
      setMsg("Rates must be numbers. Leave blank until you have a real number.");
      return;
    }
    const next = { ...draft, customerRate, carrierRate, updatedAt: nowIso() };
    onChange(next);
    setWorkspace((prev) => ({
      ...prev,
      shipments: (prev.shipments || []).map((row) => (row.id === draft.id ? next : row)),
      updatedAt: next.updatedAt,
    }));
    setMsg("Saved.");
    log("shipment", draft.id, "updated", draft.status);
  }

  function setLaneField<K extends keyof ReturnType<typeof laneFromShipment>>(key: K, value: ReturnType<typeof laneFromShipment>[K]) {
    setLane((prev) => ({ ...prev, [key]: value }));
  }

  function saveLane() {
    const origin = joinLanePlace(lane.originCity, lane.originState);
    const destination = joinLanePlace(lane.destCity, lane.destState);
    const lengthFt = parseMeasure(lane.length);
    const widthFt = parseMeasure(lane.width);
    const heightFt = parseMeasure(lane.height);
    const weightLbs = parseMeasure(lane.weight);
    const customerRate = parseMoney(lane.customerRate === "" ? 0 : lane.customerRate);
    const carrierRate = parseMoney(lane.carrierRate === "" ? 0 : lane.carrierRate);
    if (customerRate == null || carrierRate == null) {
      setMsg("Rates must be numbers. Leave blank until you have a real number.");
      return;
    }
    const dims = measuredDimensions(lengthFt, widthFt, heightFt);
    const rest = (draft.cargoUnits || []).slice(1);
    const first: CargoUnit = {
      id: draft.cargoUnits?.[0]?.id || uid("cu"),
      qty: draft.cargoUnits?.[0]?.qty || 1,
      lengthFt,
      widthFt,
      heightFt,
      weightLbs,
      notes: lane.commodity || draft.cargoUnits?.[0]?.notes || "",
    };
    const fit = recommendEquipment({
      text: lane.commodity || lane.equipmentType,
      lengthFt,
      widthFt,
      heightFt,
      weightLbs,
    });
    patch({
      origin,
      destination,
      pickupDate: lane.pickupDate,
      deliveryDate: lane.deliveryDate,
      pickupNotes: lane.pickupNotes,
      destNotes: lane.destNotes,
      appointmentPickup: lane.appointmentPickup,
      commodity: lane.commodity,
      dimensions: dims || draft.dimensions,
      weight: weightLbs != null ? String(weightLbs) : "",
      equipmentType: lane.equipmentType || (fit.trailer !== "UNKNOWN" ? fit.trailerName : draft.equipmentType),
      cargoUnits: lengthFt != null || weightLbs != null ? [first, ...rest] : rest,
      customerRate,
      carrierRate,
    });
    setMsg("Lane saved.");
    log("shipment", draft.id, "updated", "lane");
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
          <div className="lane-sheet">
            <div className="lane-block">
              <div className="home-kicker">Lane</div>
              <div className="lane-places">
                <label className="rec-field">
                  Origin city
                  <input className="az-input" value={lane.originCity} onChange={(event) => setLaneField("originCity", event.target.value)} />
                </label>
                <label className="rec-field lane-st">
                  ST
                  <input className="az-input" maxLength={2} value={lane.originState} onChange={(event) => setLaneField("originState", event.target.value.toUpperCase())} />
                </label>
                <span className="lane-arrow" aria-hidden>
                  →
                </span>
                <label className="rec-field">
                  Dest city
                  <input className="az-input" value={lane.destCity} onChange={(event) => setLaneField("destCity", event.target.value)} />
                </label>
                <label className="rec-field lane-st">
                  ST
                  <input className="az-input" maxLength={2} value={lane.destState} onChange={(event) => setLaneField("destState", event.target.value.toUpperCase())} />
                </label>
              </div>
              <div className="rec-grid">
                <label className="rec-field">
                  Pickup
                  <input className="az-input" type="date" value={lane.pickupDate} onChange={(event) => setLaneField("pickupDate", event.target.value)} />
                </label>
                <label className="rec-field">
                  Delivery
                  <input className="az-input" type="date" value={lane.deliveryDate} onChange={(event) => setLaneField("deliveryDate", event.target.value)} />
                </label>
              </div>
              <label className="rec-field lane-check">
                <input type="checkbox" checked={lane.appointmentPickup} onChange={(event) => setLaneField("appointmentPickup", event.target.checked)} />
                Pickup appointment required
              </label>
              <div className="rec-grid">
                <label className="rec-field">
                  Pickup notes
                  <input className="az-input" value={lane.pickupNotes} onChange={(event) => setLaneField("pickupNotes", event.target.value)} />
                </label>
                <label className="rec-field">
                  Delivery notes
                  <input className="az-input" value={lane.destNotes} onChange={(event) => setLaneField("destNotes", event.target.value)} />
                </label>
              </div>
            </div>
            <div className="lane-block">
              <div className="home-kicker">Cargo</div>
              <label className="rec-field">
                Commodity
                <input className="az-input" value={lane.commodity} onChange={(event) => setLaneField("commodity", event.target.value)} placeholder="What they told you is moving" />
              </label>
              <div className="desk-specs-grid">
                <label className="rec-field">
                  L ft
                  <input className="az-input" inputMode="decimal" value={lane.length} onChange={(event) => setLaneField("length", event.target.value)} />
                </label>
                <label className="rec-field">
                  W ft
                  <input className="az-input" inputMode="decimal" value={lane.width} onChange={(event) => setLaneField("width", event.target.value)} />
                </label>
                <label className="rec-field">
                  H ft
                  <input className="az-input" inputMode="decimal" value={lane.height} onChange={(event) => setLaneField("height", event.target.value)} />
                </label>
                <label className="rec-field">
                  lb
                  <input className="az-input" inputMode="decimal" value={lane.weight} onChange={(event) => setLaneField("weight", event.target.value)} />
                </label>
              </div>
              <label className="rec-field">
                Equipment
                <input className="az-input" value={lane.equipmentType} onChange={(event) => setLaneField("equipmentType", event.target.value)} placeholder="Leave blank to use the matcher" />
              </label>
              <p className="cd-mono">
                {laneFit.trailerName} · {laneFit.loadClass}. {laneFit.why}
                {laneFit.alsoFits.length ? ` Also: ${laneFit.alsoFits.join(", ")}.` : ""}
              </p>
              {combined ? (
                <p className="cd-mono">
                  Extra units combined: {combined.lengthFt}' × {combined.widthFt}' × {combined.heightFt}' · {combined.weightLbs.toLocaleString()} lb
                </p>
              ) : null}
            </div>
            <div className="lane-block">
              <div className="home-kicker">Rates</div>
              <div className="lane-rates">
                <label className="rec-field">
                  Customer
                  <input className="az-input" inputMode="decimal" value={lane.customerRate} onChange={(event) => setLaneField("customerRate", event.target.value)} placeholder="Blank until quoted" />
                </label>
                <label className="rec-field">
                  Carrier
                  <input className="az-input" inputMode="decimal" value={lane.carrierRate} onChange={(event) => setLaneField("carrierRate", event.target.value)} placeholder="Blank until covered" />
                </label>
                <div className="lane-margin">
                  <span>Margin</span>
                  <b>{lane.customerRate || lane.carrierRate ? money(laneMargin) : "—"}</b>
                </div>
              </div>
              <p className="cd-mono">Listing ask is never the rate. Type a number you actually quoted.</p>
              <button className="az-btn pri sm" type="button" onClick={saveLane}>
                Save lane
              </button>
            </div>
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

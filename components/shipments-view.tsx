"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { money, nowIso, uid } from "@/lib/format";
import { shipmentMargin } from "@/lib/freight";
import { parseMoney, SHIPMENT_STATUSES } from "@/lib/validate";
import type { Shipment, ShipmentStatus } from "@/lib/types";

const STATUSES = SHIPMENT_STATUSES;

const EMPTY: Omit<Shipment, "id" | "createdAt" | "updatedAt"> = {
  leadId: "",
  customer: "",
  contact: "",
  origin: "",
  destination: "",
  pickupDate: "",
  deliveryDate: "",
  commodity: "",
  weight: "",
  dimensions: "",
  equipmentType: "",
  carrier: "",
  carrierRate: 0,
  customerRate: 0,
  status: "Quote",
  reference: "",
  notes: "",
};

export function ShipmentsView() {
  const { workspace, setWorkspace, log, loading } = useWorkspace();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const rows = workspace.shipments || [];
  const totals = useMemo(() => {
    const live = rows.filter((item) => item.status !== "Canceled");
    const customer = live.reduce((sum, item) => sum + (Number(item.customerRate) || 0), 0);
    const carrier = live.reduce((sum, item) => sum + (Number(item.carrierRate) || 0), 0);
    return { customer, carrier, margin: customer - carrier };
  }, [rows]);

  function openNew() {
    setEditing("new");
    setDraft({
      ...EMPTY,
      leadId: workspace.leads[0]?.id || "",
      customer: workspace.leads[0] ? workspace.leads[0].company || workspace.leads[0].property : "",
      contact: workspace.leads[0]?.name || "",
    });
  }

  function openEdit(item: Shipment) {
    setEditing(item.id);
    setDraft({ ...item });
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const stamp = nowIso();
    const customerRate = parseMoney(draft.customerRate);
    const carrierRate = parseMoney(draft.carrierRate);
    if (customerRate == null || carrierRate == null) {
      setFormError("Rates must be numbers between 0 and 1,000,000.");
      return;
    }
    if (!STATUSES.includes(draft.status)) {
      setFormError("Pick a valid shipment status.");
      return;
    }
    if (!draft.customer.trim()) {
      setFormError("Customer is required.");
      return;
    }
    setFormError("");
    if (editing === "new") {
      const item: Shipment = { ...draft, id: uid("shp"), createdAt: stamp, updatedAt: stamp, customerRate, carrierRate };
      setWorkspace((prev) => ({ ...prev, shipments: [item, ...(prev.shipments || [])], updatedAt: stamp }));
      log("shipment", item.id, "created", `${item.customer} ${item.origin} → ${item.destination}`);
    } else if (editing) {
      setWorkspace((prev) => ({
        ...prev,
        shipments: (prev.shipments || []).map((item) =>
          item.id === editing ? { ...item, ...draft, customerRate, carrierRate, updatedAt: stamp } : item,
        ),
        updatedAt: stamp,
      }));
      log("shipment", editing, "updated", draft.status);
    }
    setEditing(null);
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading shipments…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Shipments</h1>
            <p>
              {rows.length === 0
                ? "No shipments yet. Quote only after you have a real customer rate."
                : `Customer ${money(totals.customer)} · carrier ${money(totals.carrier)} · gross margin ${money(totals.margin)}`}
            </p>
          </div>
          <button className="az-btn pri sm" type="button" onClick={openNew}>
            New shipment
          </button>
        </header>
        <div className="az-panel overflow-auto min-h-0 crm-table-wrap">
          <table className="az-table min-w-[1100px]">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Lane</th>
                <th>Commodity</th>
                <th>Status</th>
                <th>Customer rate</th>
                <th>Carrier</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="cursor-default">
                  <td colSpan={7} className="py-10 text-center text-[var(--muted)]">
                    No shipments yet. Quote only after you have a real customer rate — listing ask is not your rate. Intel can tell you the deck, not the dollars.
                  </td>
                </tr>
              ) : null}
              {rows.map((item) => (
                <tr key={item.id} onClick={() => openEdit(item)}>
                  <td>
                    <div className="font-medium">{item.customer}</div>
                    <div className="text-[12px] text-[var(--muted)]">{item.contact} · {item.reference || "No ref"}</div>
                  </td>
                  <td>
                    {item.origin || "—"} → {item.destination || "—"}
                  </td>
                  <td>
                    {item.commodity || "—"}
                    <div className="text-[12px] text-[var(--muted)]">{item.equipmentType || "—"}</div>
                  </td>
                  <td>
                    <span className="az-chip">{item.status}</span>
                  </td>
                  <td className="az-num">{item.customerRate ? money(item.customerRate) : "—"}</td>
                  <td className="az-num">{item.carrierRate ? money(item.carrierRate) : "—"}</td>
                  <td className="az-num text-[var(--gold-2)]">{item.customerRate || item.carrierRate ? money(shipmentMargin(item.customerRate, item.carrierRate)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing ? (
          <div className="az-overlay" onClick={() => setEditing(null)}>
            <aside className="az-drawer" onClick={(event) => event.stopPropagation()}>
              <h2>{editing === "new" ? "New shipment" : "Shipment"}</h2>
              <form className="rec-form" onSubmit={save}>
                {formError ? <p className="rec-warn">{formError}</p> : null}
                <label className="rec-field">
                  Prospect
                  <select className="az-select" value={draft.leadId} onChange={(event) => {
                    const person = workspace.leads.find((item) => item.id === event.target.value);
                    setDraft((prev) => ({
                      ...prev,
                      leadId: event.target.value,
                      customer: person?.company || person?.property || prev.customer,
                      contact: person?.name || prev.contact,
                      origin: person?.origin || prev.origin,
                      destination: person?.destination || prev.destination,
                      commodity: person?.listingTitle || prev.commodity,
                      equipmentType: person?.freightType || prev.equipmentType,
                    }));
                  }}>
                    <option value="">Unlinked</option>
                    {workspace.leads.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="rec-field">
                  Customer
                  <input className="az-input" value={draft.customer} onChange={(event) => setDraft((prev) => ({ ...prev, customer: event.target.value }))} />
                </label>
                <div className="rec-grid">
                  <label className="rec-field">
                    Origin
                    <input className="az-input" value={draft.origin} onChange={(event) => setDraft((prev) => ({ ...prev, origin: event.target.value }))} />
                  </label>
                  <label className="rec-field">
                    Destination
                    <input className="az-input" value={draft.destination} onChange={(event) => setDraft((prev) => ({ ...prev, destination: event.target.value }))} />
                  </label>
                </div>
                <div className="rec-grid">
                  <label className="rec-field">
                    Pickup
                    <input className="az-input" type="date" value={draft.pickupDate} onChange={(event) => setDraft((prev) => ({ ...prev, pickupDate: event.target.value }))} />
                  </label>
                  <label className="rec-field">
                    Delivery
                    <input className="az-input" type="date" value={draft.deliveryDate} onChange={(event) => setDraft((prev) => ({ ...prev, deliveryDate: event.target.value }))} />
                  </label>
                </div>
                <label className="rec-field">
                  Commodity
                  <input className="az-input" value={draft.commodity} onChange={(event) => setDraft((prev) => ({ ...prev, commodity: event.target.value }))} />
                </label>
                <div className="rec-grid">
                  <label className="rec-field">
                    Weight
                    <input className="az-input" value={draft.weight} onChange={(event) => setDraft((prev) => ({ ...prev, weight: event.target.value }))} />
                  </label>
                  <label className="rec-field">
                    Dimensions
                    <input className="az-input" value={draft.dimensions} onChange={(event) => setDraft((prev) => ({ ...prev, dimensions: event.target.value }))} />
                  </label>
                </div>
                <div className="rec-grid">
                  <label className="rec-field">
                    Equipment
                    <input className="az-input" value={draft.equipmentType} onChange={(event) => setDraft((prev) => ({ ...prev, equipmentType: event.target.value }))} />
                  </label>
                  <label className="rec-field">
                    Status
                    <select className="az-select" value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value as ShipmentStatus }))}>
                      {STATUSES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="rec-grid">
                  <label className="rec-field">
                    Customer rate
                    <input className="az-input" type="number" value={draft.customerRate} onChange={(event) => setDraft((prev) => ({ ...prev, customerRate: Number(event.target.value) }))} />
                  </label>
                  <label className="rec-field">
                    Carrier cost
                    <input className="az-input" type="number" value={draft.carrierRate} onChange={(event) => setDraft((prev) => ({ ...prev, carrierRate: Number(event.target.value) }))} />
                  </label>
                </div>
                <p className="cd-mono">Gross margin {money(shipmentMargin(Number(draft.customerRate) || 0, Number(draft.carrierRate) || 0))}</p>
                <label className="rec-field">
                  Carrier
                  <input className="az-input" value={draft.carrier} onChange={(event) => setDraft((prev) => ({ ...prev, carrier: event.target.value }))} />
                </label>
                <label className="rec-field">
                  Reference
                  <input className="az-input" value={draft.reference} onChange={(event) => setDraft((prev) => ({ ...prev, reference: event.target.value }))} />
                </label>
                <label className="rec-field">
                  Notes
                  <textarea className="az-area" value={draft.notes} onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))} />
                </label>
                <div className="rec-save">
                  <button className="az-btn pri" type="submit">
                    Save
                  </button>
                  <button className="az-btn" type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}

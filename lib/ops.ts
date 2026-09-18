import { nowIso, uid } from "./format";
import type { Carrier, CarrierVetItem, KpiEvent, Shipment, TrackingEvent, TrackingKind, VetState, Workspace } from "./types";

export const VET_CHECKS: { id: string; label: string }[] = [
  { id: "mc", label: "MC verified" },
  { id: "dot", label: "DOT verified" },
  { id: "authority", label: "Authority active" },
  { id: "insurance", label: "Insurance verified" },
  { id: "safety", label: "Safety review" },
  { id: "equipment", label: "Equipment confirmed" },
  { id: "packet", label: "Carrier packet received" },
  { id: "license", label: "Driver’s license" },
  { id: "truck", label: "Truck photo" },
  { id: "plate", label: "Plate number" },
  { id: "pickup", label: "Pickup requirements sent" },
];

export const TRACKING_KINDS: TrackingKind[] = [
  "Pickup scheduled",
  "Driver confirmed",
  "Driver en route",
  "At pickup",
  "Loaded",
  "In transit",
  "Check call",
  "At delivery",
  "Delivered",
  "POD received",
];

export function defaultVetting(): CarrierVetItem[] {
  return VET_CHECKS.map((item) => ({ id: item.id, label: item.label, state: "unchecked" as VetState }));
}

export function normalizeCarrier(carrier: Carrier): Carrier & { vetting: CarrierVetItem[] } {
  const vetting = carrier.vetting?.length ? carrier.vetting : defaultVetting();
  const byId = new Map(vetting.map((item) => [item.id, item]));
  return {
    ...carrier,
    preferred: Boolean(carrier.preferred),
    blocked: Boolean(carrier.blocked),
    vetting: VET_CHECKS.map((item) => byId.get(item.id) || { id: item.id, label: item.label, state: "unchecked" }),
  };
}

export function normalizeShipment(shipment: Shipment): Shipment {
  return {
    ...shipment,
    loadNumber: shipment.loadNumber || "",
    podReceived: Boolean(shipment.podReceived),
    tracking: shipment.tracking || [],
    cargoUnits: shipment.cargoUnits || [],
    pickupNotes: shipment.pickupNotes || "",
    destNotes: shipment.destNotes || "",
    appointmentPickup: Boolean(shipment.appointmentPickup),
  };
}

export function nextLoadNumber(workspace: Workspace) {
  const used = (workspace.shipments || [])
    .map((item) => Number(String(item.loadNumber || "").replace(/^HAUL-/, "")))
    .filter((n) => Number.isFinite(n) && n >= 1000);
  const next = (used.length ? Math.max(...used) : 1000) + 1;
  return `HAUL-${next}`;
}

function pushKpi(workspace: Workspace, type: string, leadId?: string, detail?: string): Workspace {
  const event: KpiEvent = { id: uid("kpi"), type, leadId, at: nowIso(), detail };
  return { ...workspace, kpiEvents: [event, ...(workspace.kpiEvents || [])] };
}

export function convertQuoteToLoad(workspace: Workspace, shipmentId: string) {
  const stamp = nowIso();
  const current = (workspace.shipments || []).find((item) => item.id === shipmentId);
  if (!current) return { ok: false as const, error: "Shipment not found." };
  if (current.status !== "Quote") return { ok: false as const, error: "Only a Quote can be converted to a load." };
  const covered = Boolean(current.carrierId || current.carrier.trim());
  const next: Shipment = {
    ...current,
    status: covered ? "Carrier Booked" : "Carrier Needed",
    loadNumber: current.loadNumber || nextLoadNumber(workspace),
    updatedAt: stamp,
    tracking: [
      ...(current.tracking || []),
      { id: uid("trk"), at: stamp, kind: "Pickup scheduled", note: "Quote accepted — load opened." },
    ],
  };
  let nextWorkspace: Workspace = {
    ...workspace,
    shipments: (workspace.shipments || []).map((item) => (item.id === shipmentId ? next : item)),
    updatedAt: stamp,
  };
    nextWorkspace = pushKpi(nextWorkspace, "quote_accepted", current.leadId, next.loadNumber);
    nextWorkspace = pushKpi(nextWorkspace, "load_booked", current.leadId, next.loadNumber);
    nextWorkspace = {
      ...nextWorkspace,
      activities: [
        {
          id: uid("act"),
          entityType: "shipment",
          entityId: next.id,
          type: "load",
          detail: `${next.loadNumber} opened from quote`,
          at: stamp,
        },
        ...(nextWorkspace.activities || []),
      ],
    };
  if (current.leadId) {
    nextWorkspace = {
      ...nextWorkspace,
      leads: nextWorkspace.leads.map((lead) =>
        lead.id === current.leadId
          ? { ...lead, status: "Load Won", nextAction: covered ? "Carrier booked. Confirm pickup." : "Need a carrier on file.", updatedAt: stamp }
          : lead,
      ),
    };
  }
  return { ok: true as const, shipment: next, workspace: nextWorkspace };
}

export function recordTracking(workspace: Workspace, shipmentId: string, kind: TrackingKind, note = "", location = "") {
  const stamp = nowIso();
  const current = (workspace.shipments || []).find((item) => item.id === shipmentId);
  if (!current) return { ok: false as const, error: "Shipment not found." };
  const event: TrackingEvent = { id: uid("trk"), at: stamp, kind, note, location };
  let status = current.status;
  let podReceived = current.podReceived || false;
  if (kind === "At pickup") status = "Pickup Scheduled";
  if (kind === "Loaded" || kind === "In transit" || kind === "Check call") status = "In Transit";
  if (kind === "Delivered") status = "Delivered";
  if (kind === "POD received") {
    status = "Delivered";
    podReceived = true;
  }
  const next: Shipment = {
    ...current,
    status,
    podReceived,
    updatedAt: stamp,
    tracking: [...(current.tracking || []), event],
  };
  let nextWorkspace: Workspace = {
    ...workspace,
    shipments: (workspace.shipments || []).map((item) => (item.id === shipmentId ? next : item)),
    updatedAt: stamp,
  };
  if (kind === "Delivered") nextWorkspace = pushKpi(nextWorkspace, "delivery", current.leadId, next.loadNumber || next.id);
  if (kind === "POD received") nextWorkspace = pushKpi(nextWorkspace, "pod_received", current.leadId, next.loadNumber || next.id);
  return { ok: true as const, shipment: next, workspace: nextWorkspace };
}

export function setVetCheck(workspace: Workspace, carrierId: string, checkId: string, state: VetState, by = "Michael", note = "") {
  const stamp = nowIso();
  const current = (workspace.carriers || []).find((item) => item.id === carrierId);
  if (!current) return { ok: false as const, error: "Carrier not found." };
  const carrier = normalizeCarrier(current);
  const next: Carrier = {
    ...carrier,
    vetting: carrier.vetting.map((item) =>
      item.id === checkId ? { ...item, state, at: stamp, by, note } : item,
    ),
  };
  return {
    ok: true as const,
    carrier: next,
    workspace: {
      ...workspace,
      carriers: (workspace.carriers || []).map((item) => (item.id === carrierId ? next : item)),
      updatedAt: stamp,
    },
  };
}

export function carrierVerified(carrier: Carrier) {
  const checks = normalizeCarrier(carrier).vetting;
  const required = ["mc", "dot", "authority", "insurance"];
  return required.every((id) => checks.find((item) => item.id === id)?.state === "pass");
}

export function lastTrackingAt(shipment: Shipment) {
  const events = shipment.tracking || [];
  if (!events.length) return Date.parse(shipment.updatedAt) || 0;
  return Math.max(...events.map((item) => Date.parse(item.at) || 0));
}

export type AttentionItem = {
  id: string;
  title: string;
  why: string;
  href: string;
};

function ymd(value: string) {
  return String(value || "").slice(0, 10);
}

function todayStamp(now: Date) {
  return now.toISOString().slice(0, 10);
}

export function deskAttention(workspace: Workspace, now = new Date()): AttentionItem[] {
  const items: AttentionItem[] = [];
  const liveLeads = new Set(workspace.leads.filter((lead) => !lead.archivedAt).map((lead) => lead.id));
  const today = todayStamp(now);
  const nowMs = now.getTime();

  for (const row of workspace.callbacks || []) {
    if (row.status !== "open" || !liveLeads.has(row.leadId)) continue;
    if (Date.parse(row.dueAt) >= nowMs) continue;
    const person = workspace.leads.find((lead) => lead.id === row.leadId);
    const mins = Math.max(1, Math.round((nowMs - Date.parse(row.dueAt)) / 60000));
    items.push({
      id: `cb-${row.id}`,
      title: person?.name || "Follow-up",
      why: `Callback due ${mins} min ago`,
      href: "/callbacks",
    });
  }

  for (const row of workspace.shipments || []) {
    if (row.status === "Canceled") continue;
    const ref = row.loadNumber || row.customer;
    if (row.status === "Quote" && (Number(row.customerRate) || 0) > 0) {
      items.push({
        id: `q-${row.id}`,
        title: ref,
        why: "Quote awaiting response",
        href: `/shipments?id=${encodeURIComponent(row.id)}`,
      });
    }
    if (row.status === "Carrier Needed" || (row.status !== "Quote" && !row.carrierId && !row.carrier)) {
      items.push({
        id: `cov-${row.id}`,
        title: ref,
        why: "Load without a carrier on file",
        href: `/shipments?id=${encodeURIComponent(row.id)}`,
      });
    }
    if (ymd(row.pickupDate) === today && !["Delivered", "Paid", "Canceled"].includes(row.status)) {
      items.push({
        id: `pu-${row.id}`,
        title: ref,
        why: "Pickup today",
        href: `/shipments?id=${encodeURIComponent(row.id)}`,
      });
    }
    if (ymd(row.deliveryDate) === today && !["Paid", "Canceled"].includes(row.status)) {
      items.push({
        id: `del-${row.id}`,
        title: ref,
        why: "Delivery today",
        href: `/shipments?id=${encodeURIComponent(row.id)}`,
      });
    }
    if (row.status === "In Transit" && nowMs - lastTrackingAt(row) > 24 * 60 * 60 * 1000) {
      items.push({
        id: `stale-${row.id}`,
        title: ref,
        why: "Tracking stale — no check in 24h",
        href: `/shipments?id=${encodeURIComponent(row.id)}`,
      });
    }
    if (row.status === "Delivered" && !row.podReceived) {
      items.push({
        id: `pod-${row.id}`,
        title: ref,
        why: "Outstanding POD",
        href: `/shipments?id=${encodeURIComponent(row.id)}`,
      });
    }
  }

  for (const row of workspace.carriers || []) {
    if (row.blocked) continue;
    if (!row.mc && !row.dot) {
      items.push({
        id: `vet-${row.id}`,
        title: row.name,
        why: "Carrier file missing MC and DOT",
        href: "/carriers",
      });
    }
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, 12);
}

export function liveLoadSnapshot(workspace: Workspace) {
  return (workspace.shipments || [])
    .filter((item) => !["Quote", "Canceled", "Paid"].includes(item.status))
    .map((item) => ({
      ...item,
      margin: (Number(item.customerRate) || 0) - (Number(item.carrierRate) || 0),
      lastCheck: (item.tracking || []).at(-1)?.kind || "—",
    }))
    .slice(0, 8);
}

export function bookedMargin(workspace: Workspace) {
  const live = (workspace.shipments || []).filter((item) => !["Quote", "Canceled"].includes(item.status));
  const customer = live.reduce((sum, item) => sum + (Number(item.customerRate) || 0), 0);
  const carrier = live.reduce((sum, item) => sum + (Number(item.carrierRate) || 0), 0);
  const quoted = (workspace.shipments || []).filter((item) => item.status === "Quote").length;
  const booked = live.length;
  return { customer, carrier, margin: customer - carrier, quoted, booked };
}

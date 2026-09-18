import type { Activity, Appointment, Callback, CallLog, Lead, Opportunity, Workspace } from "./types";
import { normalizePhone, nowIso } from "./format";

export function isLiveLead(lead: Lead) {
  return !lead.archivedAt;
}

export function liveLeads(leads: Lead[]) {
  return leads.filter(isLiveLead);
}

export function archiveLead(workspace: Workspace, leadId: string): Workspace {
  const stamp = nowIso();
  return {
    ...workspace,
    leads: workspace.leads.map((item) => (item.id === leadId ? { ...item, archivedAt: stamp, updatedAt: stamp } : item)),
    updatedAt: stamp,
  };
}

export function restoreLead(workspace: Workspace, leadId: string): Workspace {
  const stamp = nowIso();
  return {
    ...workspace,
    leads: workspace.leads.map((item) => (item.id === leadId ? { ...item, archivedAt: undefined, updatedAt: stamp } : item)),
    updatedAt: stamp,
  };
}

export function findDuplicateLeads(leads: Lead[], lead: Pick<Lead, "id" | "phone" | "email">) {
  const phone = normalizePhone(lead.phone);
  const email = lead.email.trim().toLowerCase();
  return leads.filter((item) => {
    if (item.id === lead.id || item.archivedAt) return false;
    const samePhone = phone.length >= 10 && normalizePhone(item.phone) === phone;
    const sameEmail = Boolean(email) && item.email.trim().toLowerCase() === email;
    return samePhone || sameEmail;
  });
}

export type TimelineItem = {
  id: string;
  at: string;
  kind: string;
  detail: string;
};

export function contactTimeline(workspace: Workspace, leadId: string): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const row of workspace.activities || []) {
    if (row.entityId !== leadId) continue;
    items.push({ id: row.id, at: row.at, kind: row.type, detail: row.detail });
  }
  for (const row of workspace.callLogs || []) {
    if (row.leadId !== leadId) continue;
    items.push({
      id: row.id,
      at: row.at,
      kind: "call",
      detail: `${row.outcome.replaceAll("_", " ")} · ${Math.floor(row.duration / 60)}:${String(row.duration % 60).padStart(2, "0")}${row.notes ? ` · ${row.notes}` : ""}`,
    });
  }
  for (const row of workspace.callbacks || []) {
    if (row.leadId !== leadId) continue;
    items.push({
      id: row.id,
      at: row.createdAt,
      kind: "follow-up",
      detail: `${row.status} · ${row.type} · ${row.reason || row.notes || "Follow-up"}`,
    });
  }
  for (const row of workspace.appointments || []) {
    if (row.leadId !== leadId) continue;
    items.push({
      id: row.id,
      at: row.createdAt || row.startsAt,
      kind: "appointment",
      detail: `${row.status} · ${row.type} · ${row.location || ""}`.trim(),
    });
  }
  for (const row of workspace.listings || []) {
    if (row.leadId !== leadId) continue;
    items.push({
      id: row.id,
      at: row.discoveredAt,
      kind: "listing",
      detail: `${row.title} · ${row.source}${row.askingPrice != null ? ` · $${row.askingPrice}` : ""}`,
    });
  }
  for (const row of workspace.quotes || []) {
    if (row.leadId !== leadId) continue;
    items.push({
      id: row.id,
      at: row.createdAt,
      kind: "quote",
      detail: `${row.origin} → ${row.destination} · customer $${row.customerRate} · carrier $${row.carrierCost}`,
    });
  }
  for (const row of workspace.shipments || []) {
    if (row.leadId !== leadId) continue;
    items.push({
      id: row.id,
      at: row.createdAt,
      kind: "shipment",
      detail: `${row.loadNumber || row.status} · ${row.origin} → ${row.destination} · ${row.commodity}`,
    });
    for (const event of row.tracking || []) {
      items.push({
        id: event.id,
        at: event.at,
        kind: "tracking",
        detail: `${row.loadNumber || row.status} · ${event.kind}${event.note ? ` · ${event.note}` : ""}`,
      });
    }
  }
  for (const row of workspace.analyses || []) {
    if (row.leadId !== leadId) continue;
    items.push({
      id: `ai-${row.leadId}-${row.analyzedAt}`,
      at: row.analyzedAt,
      kind: "ai",
      detail: `Freight score ${row.score}/100 (${row.confidence}). ${row.why}`,
    });
  }

  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.at}|${item.kind}|${item.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 40);
}

export function relatedFor(workspace: Workspace, leadId: string) {
  return {
    opportunities: workspace.opportunities.filter((item) => item.leadId === leadId) as Opportunity[],
    callbacks: workspace.callbacks.filter((item) => item.leadId === leadId) as Callback[],
    appointments: workspace.appointments.filter((item) => item.leadId === leadId) as Appointment[],
    calls: (workspace.callLogs || []).filter((item) => item.leadId === leadId) as CallLog[],
    activities: (workspace.activities || []).filter((item) => item.entityId === leadId) as Activity[],
    design: workspace.designs?.[leadId] || null,
    proposal: workspace.proposals?.[leadId] || null,
    listings: (workspace.listings || []).filter((item) => item.leadId === leadId),
    quotes: (workspace.quotes || []).filter((item) => item.leadId === leadId),
    shipments: (workspace.shipments || []).filter((item) => item.leadId === leadId),
    company: (workspace.companies || []).find((item) => workspace.leads.find((lead) => lead.id === leadId)?.companyId === item.id) || null,
    analysis: (workspace.analyses || []).find((item) => item.leadId === leadId) || null,
  };
}

const CSV_HEADERS = ["name", "phone", "email", "company", "city", "state", "source", "category", "equipmentType", "status", "freightScore", "listingUrl", "owner", "notes"] as const;

function csvEscape(value: string | number | boolean | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function contactsToCsv(leads: Lead[]) {
  const lines = [
    CSV_HEADERS.join(","),
    ...leads.map((lead) =>
      [
        lead.name,
        lead.phone,
        lead.email,
        lead.company || lead.property,
        lead.city,
        lead.state || "",
        lead.source,
        lead.category || "",
        lead.equipmentType || "",
        lead.status,
        lead.freightScore ?? "",
        lead.listingUrl || "",
        lead.owner,
        lead.notes,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];
  return lines.join("\n");
}

export function downloadText(filename: string, body: string, type = "text/csv") {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

export type ImportDraft = {
  name: string;
  phone: string;
  email: string;
  property: string;
  city: string;
  state: string;
  category: string;
  listingUrl: string;
  utility: string;
  monthlyBill: number | null;
  owner: string;
  source: string;
  notes: string;
  duplicateOf?: string;
};

export function parseContactCsv(text: string, existing: Lead[]): { rows: ImportDraft[]; error?: string } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], error: "File needs a header row and at least one contact." };
  const header = splitCsvLine(lines[0]).map((cell) => cell.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  if (idx("name") < 0 && idx("phone") < 0) return { rows: [], error: "Header must include name or phone." };

  const rows: ImportDraft[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? cells[i]?.trim() || "" : "";
    };
    const name = get("name") || "Imported contact";
    const phone = get("phone");
    const email = get("email");
    if (!name && !phone && !email) continue;
    const billRaw = get("monthlybill") || get("monthly_bill");
    const draft: ImportDraft = {
      name,
      phone,
      email,
      property: get("company") || get("property"),
      city: get("city"),
      state: get("state"),
      category: get("category") || get("equipmenttype"),
      listingUrl: get("listingurl") || get("url"),
      utility: get("utility"),
      monthlyBill: billRaw ? Number(billRaw) || null : null,
      owner: get("owner"),
      source: get("source") || "CSV",
      notes: get("notes"),
    };
    const dup = findDuplicateLeads(existing, { id: "", phone: draft.phone, email: draft.email })[0];
    if (dup) draft.duplicateOf = dup.name;
    rows.push(draft);
  }
  return { rows };
}

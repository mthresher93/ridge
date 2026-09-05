import { NextResponse } from "next/server";
import { readJsonStore, writeJsonStore } from "@/lib/json-store";
import { loadAzimuth, saveAzimuth } from "@/lib/workspace-io";
import type { Lead } from "@/lib/types";

const STORE_ID = "conduit-connectors";

type InboxItem = {
  id: string;
  status: "quarantine" | "imported" | "rejected";
  sourceLabel: string;
  channel: string;
  receivedAt: string;
  costCents: number;
  dncBlocked: boolean;
  lead: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
    consentAccepted?: boolean;
  };
};

type Source = {
  id: string;
  label: string;
  category: string;
  unitCostCents: number;
  budgetCents: number;
  received: number;
  imported: number;
  duplicates: number;
  suppressed: number;
  recordedSpendCents: number;
  attributedCostCents: number;
};

type ConnectorState = {
  connectors: Array<{ id: string; label: string; cost: string; ready: boolean; detail: string }>;
  sources: Source[];
  inbox: InboxItem[];
};

function emptyState(): ConnectorState {
  return {
    connectors: [
      {
        id: "signed-webhook",
        label: "Signed webhook",
        cost: "Free",
        ready: true,
        detail: "POST JSON into /api/conduit/leads/intake. Records land in quarantine until you import them.",
      },
      {
        id: "native-form",
        label: "Native website form",
        cost: "Free",
        ready: true,
        detail: "POST the published form to /api/conduit/leads/capture. Honeypot field website is discarded.",
      },
    ],
    sources: [
      {
        id: "native-organic",
        label: "Owned form",
        category: "owned",
        unitCostCents: 0,
        budgetCents: 0,
        received: 0,
        imported: 0,
        duplicates: 0,
        suppressed: 0,
        recordedSpendCents: 0,
        attributedCostCents: 0,
      },
    ],
    inbox: [],
  };
}

function counts(state: ConnectorState) {
  return {
    quarantine: state.inbox.filter((item) => item.status === "quarantine").length,
    imported: state.inbox.filter((item) => item.status === "imported").length,
    duplicate: state.sources.reduce((sum, row) => sum + row.duplicates, 0),
    suppressed: state.sources.reduce((sum, row) => sum + row.suppressed, 0),
  };
}

async function load(): Promise<ConnectorState> {
  const stored = await readJsonStore<ConnectorState>(STORE_ID, emptyState());
  return {
    ...emptyState(),
    ...stored,
    connectors: stored.connectors?.length ? stored.connectors : emptyState().connectors,
    sources: stored.sources?.length ? stored.sources : emptyState().sources,
    inbox: stored.inbox || [],
  };
}

function payload(state: ConnectorState) {
  return { ...state, counts: counts(state) };
}

export async function GET() {
  return NextResponse.json(payload(await load()));
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const state = await load();
  const action = String(body.action || "");

  if (action === "test-intake") {
    const item: InboxItem = {
      id: `intake-${Date.now()}`,
      status: "quarantine",
      sourceLabel: "Local test",
      channel: "test",
      receivedAt: new Date().toISOString(),
      costCents: 0,
      dncBlocked: false,
      lead: {
        name: String(body.name || "Connector test"),
        email: String(body.email || ""),
        consentAccepted: true,
      },
    };
    state.inbox.unshift(item);
    const source = state.sources[0];
    if (source) source.received += 1;
  } else if (action === "source") {
    state.sources.push({
      id: `source-${Date.now()}`,
      label: String(body.label || "Untitled source"),
      category: String(body.category || "other"),
      unitCostCents: Number(body.unitCostCents) || 0,
      budgetCents: Number(body.budgetCents) || 0,
      received: 0,
      imported: 0,
      duplicates: 0,
      suppressed: 0,
      recordedSpendCents: 0,
      attributedCostCents: 0,
    });
  } else if (action === "spend") {
    const source = state.sources.find((row) => row.id === body.sourceId);
    if (source) source.recordedSpendCents += Number(body.amountCents) || 0;
  } else if (action === "reject") {
    const item = state.inbox.find((row) => row.id === body.id);
    if (item) item.status = "rejected";
  } else if (action === "import") {
    const item = state.inbox.find((row) => row.id === body.id);
    if (item && item.status === "quarantine") {
      item.status = "imported";
      const source = state.sources.find((row) => row.label === item.sourceLabel) || state.sources[0];
      if (source) source.imported += 1;
      const { workspace } = await loadAzimuth();
      const now = new Date().toISOString();
      const lead: Lead = {
        id: `lead-${Date.now()}`,
        name: item.lead.name || "Imported lead",
        property: item.lead.address || "",
        phone: item.lead.phone || "",
        email: item.lead.email || "",
        city: "",
        utility: "",
        monthlyBill: null,
        status: "New Lead",
        priority: "Medium",
        owner: workspace.settings.defaultOwner,
        source: item.sourceLabel,
        consent: item.lead.consentAccepted ? "verified" : "unknown",
        dnc: false,
        attempts: 0,
        nextAction: "Review imported record",
        nextFollowUp: "",
        estimatedValue: 0,
        notes: "Imported from Conduit quarantine.",
        homeowner: "Unknown",
        createdAt: now,
        updatedAt: now,
      };
      await saveAzimuth({ ...workspace, leads: [lead, ...workspace.leads], updatedAt: now });
    }
  } else {
    return NextResponse.json({ error: "Unknown connector action" }, { status: 400 });
  }

  await writeJsonStore(STORE_ID, state);
  return NextResponse.json(payload(state));
}

import { NextResponse } from "next/server";
import { readJsonStore, writeJsonStore } from "@/lib/json-store";

const STORE_ID = "conduit-connectors";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    sourceId?: string;
    lead?: { name?: string; phone?: string; email?: string; address?: string; consentAccepted?: boolean };
  };
  const state = await readJsonStore<{ inbox?: unknown[]; sources?: Array<{ id: string; received: number }> }>(STORE_ID, {
    inbox: [],
    sources: [],
  });
  const inbox = Array.isArray(state.inbox) ? state.inbox : [];
  inbox.unshift({
    id: `intake-${Date.now()}`,
    status: "quarantine",
    sourceLabel: body.sourceId || "signed-webhook",
    channel: "webhook",
    receivedAt: new Date().toISOString(),
    costCents: 0,
    dncBlocked: false,
    lead: body.lead || {},
  });
  await writeJsonStore(STORE_ID, { ...state, inbox });
  return NextResponse.json({ ok: true, quarantined: true });
}

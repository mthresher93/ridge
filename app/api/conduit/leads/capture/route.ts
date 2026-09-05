import { NextResponse } from "next/server";
import { readJsonStore, writeJsonStore } from "@/lib/json-store";

const STORE_ID = "conduit-connectors";

export async function POST(request: Request) {
  const form = await request.formData();
  if (String(form.get("website") || "")) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const name = String(form.get("name") || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const state = await readJsonStore<{ inbox?: unknown[] }>(STORE_ID, { inbox: [] });
  const inbox = Array.isArray(state.inbox) ? state.inbox : [];
  inbox.unshift({
    id: `intake-${Date.now()}`,
    status: "quarantine",
    sourceLabel: String(form.get("sourceId") || "native-organic"),
    channel: "form",
    receivedAt: new Date().toISOString(),
    costCents: 0,
    dncBlocked: false,
    lead: {
      name,
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
      address: String(form.get("address") || ""),
      consentAccepted: form.get("consent") === "on" || form.get("consent") === "true",
    },
  });
  await writeJsonStore(STORE_ID, { ...state, inbox });
  return NextResponse.redirect(new URL("/console", request.url), 303);
}

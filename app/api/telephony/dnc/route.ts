import { NextResponse } from "next/server";
import { readJsonStore, writeJsonStore } from "@/lib/json-store";

const STORE_ID = "conduit-dnc";

type DncState = { hashes: string[]; internal: string[] };

function empty(): DncState {
  return { hashes: [], internal: [] };
}

export async function GET() {
  const state = await readJsonStore<DncState>(STORE_ID, empty());
  return NextResponse.json({
    registry: {
      total: state.hashes.length + state.internal.length,
      hardenedHashKey: Boolean(process.env.CONDUIT_DNC_HASH_KEY),
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    phone?: string;
    numbers?: string[];
  };
  const state = await readJsonStore<DncState>(STORE_ID, empty());
  if (body.action === "internal" && body.phone) {
    if (!state.internal.includes(body.phone)) state.internal.push(body.phone);
  }
  if (Array.isArray(body.numbers)) {
    for (const number of body.numbers) {
      if (number && !state.hashes.includes(number)) state.hashes.push(number);
    }
  }
  await writeJsonStore(STORE_ID, state);
  return NextResponse.json({
    ok: true,
    accepted: Array.isArray(body.numbers) ? body.numbers.length : body.phone ? 1 : 0,
    registry: {
      total: state.hashes.length + state.internal.length,
      hardenedHashKey: Boolean(process.env.CONDUIT_DNC_HASH_KEY),
    },
  });
}

import { NextResponse } from "next/server";
import { applyConduitStore, buildConduitStore, loadAzimuth, saveAzimuth } from "@/lib/workspace-io";
import { isWorkspace, normalizeWorkspace } from "@/lib/seed";

export async function GET() {
  const { workspace, updatedAt } = await loadAzimuth();
  const store = await buildConduitStore(workspace);
  return NextResponse.json({ workspace, store, updatedAt });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { workspace?: unknown; store?: Record<string, string> };

  if (body.store && typeof body.store === "object") {
    const saved = await applyConduitStore(body.store);
    return NextResponse.json({ ok: true, ignored: saved.ignored, updatedAt: saved.updatedAt });
  }

  if (!isWorkspace(body.workspace)) {
    return NextResponse.json({ error: "azimuth workspace required" }, { status: 400 });
  }

  const incoming = normalizeWorkspace({
    ...body.workspace,
    updatedAt: body.workspace.updatedAt || new Date().toISOString(),
  });
  const saved = await saveAzimuth(incoming);
  return NextResponse.json({ ok: true, ignored: saved.ignored, updatedAt: saved.updatedAt });
}

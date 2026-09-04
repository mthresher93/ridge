import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSeed, isWorkspace, normalizeWorkspace } from "@/lib/seed";
import { hydrateSolar, persistSolar } from "@/lib/persist";

const STORE_ID = "azimuth";

export async function GET() {
  const row = await prisma.workspaceStore.findUnique({ where: { id: STORE_ID } });
  if (!row) {
    const workspace = normalizeWorkspace(createSeed());
    const created = await prisma.workspaceStore.create({
      data: { id: STORE_ID, payload: JSON.stringify(workspace) },
    });
    await persistSolar(workspace).catch(() => {});
    return NextResponse.json({ workspace, updatedAt: created.updatedAt.toISOString() });
  }

  try {
    const parsed = JSON.parse(row.payload) as unknown;
    if (!isWorkspace(parsed)) {
      const workspace = normalizeWorkspace(createSeed());
      const updated = await prisma.workspaceStore.update({
        where: { id: STORE_ID },
        data: { payload: JSON.stringify(workspace) },
      });
      await persistSolar(workspace).catch(() => {});
      return NextResponse.json({ workspace, updatedAt: updated.updatedAt.toISOString() });
    }
    const workspace = await hydrateSolar(normalizeWorkspace(parsed));
    try {
      await persistSolar(workspace);
    } catch (error) {
      console.error("persistSolar failed", error);
    }
    return NextResponse.json({ workspace, updatedAt: row.updatedAt.toISOString() });
  } catch {
    const workspace = normalizeWorkspace(createSeed());
    const updated = await prisma.workspaceStore.update({
      where: { id: STORE_ID },
      data: { payload: JSON.stringify(workspace) },
    });
    await persistSolar(workspace).catch(() => {});
    return NextResponse.json({ workspace, updatedAt: updated.updatedAt.toISOString() });
  }
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { workspace?: unknown };
  if (!isWorkspace(body.workspace)) {
    return NextResponse.json({ error: "azimuth workspace required" }, { status: 400 });
  }

  const incoming = normalizeWorkspace({ ...body.workspace, updatedAt: body.workspace.updatedAt || new Date().toISOString() });
  const existing = await prisma.workspaceStore.findUnique({ where: { id: STORE_ID } });
  if (existing) {
    try {
      const parsed = JSON.parse(existing.payload) as { updatedAt?: string };
      if (parsed.updatedAt && Date.parse(incoming.updatedAt) + 1500 < Date.parse(parsed.updatedAt)) {
        return NextResponse.json({ ok: true, ignored: true, updatedAt: existing.updatedAt.toISOString() });
      }
    } catch {
      /* write anyway */
    }
  }

  const row = await prisma.workspaceStore.upsert({
    where: { id: STORE_ID },
    update: { payload: JSON.stringify(incoming) },
    create: { id: STORE_ID, payload: JSON.stringify(incoming) },
  });
  try {
    await persistSolar(incoming);
  } catch (error) {
    console.error("persistSolar failed", error);
  }

  return NextResponse.json({ ok: true, updatedAt: row.updatedAt.toISOString() });
}

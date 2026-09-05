import { prisma } from "./prisma";
import { azimuthToConduit, mergeConduitIntoAzimuth, parseConduitCrm } from "./conduit-bridge";
import { readJsonStore, writeJsonStore } from "./json-store";
import { hydrateSolar, persistSolar } from "./persist";
import { createSeed, isWorkspace, normalizeWorkspace } from "./seed";
import type { Workspace } from "./types";

const AZIMUTH_ID = "azimuth";
const EXTRA_ID = "conduit-ls";
const PRODUCT_ID = "conduit-product";

export async function loadAzimuth(): Promise<{ workspace: Workspace; updatedAt: string }> {
  const row = await prisma.workspaceStore.findUnique({ where: { id: AZIMUTH_ID } });
  if (!row) {
    const workspace = normalizeWorkspace(createSeed());
    const created = await prisma.workspaceStore.create({
      data: { id: AZIMUTH_ID, payload: JSON.stringify(workspace) },
    });
    await persistSolar(workspace).catch(() => {});
    return { workspace, updatedAt: created.updatedAt.toISOString() };
  }

  try {
    const parsed = JSON.parse(row.payload) as unknown;
    if (!isWorkspace(parsed)) {
      const workspace = normalizeWorkspace(createSeed());
      const updated = await prisma.workspaceStore.update({
        where: { id: AZIMUTH_ID },
        data: { payload: JSON.stringify(workspace) },
      });
      await persistSolar(workspace).catch(() => {});
      return { workspace, updatedAt: updated.updatedAt.toISOString() };
    }
    const workspace = await hydrateSolar(normalizeWorkspace(parsed));
    await persistSolar(workspace).catch((error) => console.error("persistSolar failed", error));
    return { workspace, updatedAt: row.updatedAt.toISOString() };
  } catch {
    const workspace = normalizeWorkspace(createSeed());
    const updated = await prisma.workspaceStore.update({
      where: { id: AZIMUTH_ID },
      data: { payload: JSON.stringify(workspace) },
    });
    await persistSolar(workspace).catch(() => {});
    return { workspace, updatedAt: updated.updatedAt.toISOString() };
  }
}

export async function saveAzimuth(incoming: Workspace, opts?: { skipIfStale?: boolean }) {
  const normalized = normalizeWorkspace({
    ...incoming,
    updatedAt: incoming.updatedAt || new Date().toISOString(),
  });
  const existing = await prisma.workspaceStore.findUnique({ where: { id: AZIMUTH_ID } });
  if (opts?.skipIfStale !== false && existing) {
    try {
      const parsed = JSON.parse(existing.payload) as { updatedAt?: string };
      if (parsed.updatedAt && Date.parse(normalized.updatedAt) + 1500 < Date.parse(parsed.updatedAt)) {
        return { ignored: true as const, updatedAt: existing.updatedAt.toISOString(), workspace: normalized };
      }
    } catch {
      /* write anyway */
    }
  }

  const row = await prisma.workspaceStore.upsert({
    where: { id: AZIMUTH_ID },
    update: { payload: JSON.stringify(normalized) },
    create: { id: AZIMUTH_ID, payload: JSON.stringify(normalized) },
  });
  await persistSolar(normalized).catch((error) => console.error("persistSolar failed", error));
  return { ignored: false as const, updatedAt: row.updatedAt.toISOString(), workspace: normalized };
}

export async function extraStore(): Promise<Record<string, string>> {
  return readJsonStore<Record<string, string>>(EXTRA_ID, {});
}

export async function saveExtraStore(store: Record<string, string>) {
  const current = await extraStore();
  const next = { ...current };
  for (const [key, value] of Object.entries(store)) {
    if (!key.startsWith("conduit")) continue;
    if (key === "conduit.crm.v1") continue;
    next[key] = value;
  }
  await writeJsonStore(EXTRA_ID, next);
  return next;
}

export async function buildConduitStore(workspace: Workspace) {
  const extra = await extraStore();
  return {
    ...extra,
    "conduit.crm.v1": JSON.stringify(azimuthToConduit(workspace)),
  };
}

export async function applyConduitStore(store: Record<string, string>) {
  const { workspace } = await loadAzimuth();
  const crm = parseConduitCrm(store["conduit.crm.v1"]);
  const hasRecords = Boolean(crm?.leads?.length || crm?.opportunities?.length);
  const merged = hasRecords && crm ? mergeConduitIntoAzimuth(workspace, crm) : workspace;
  const saved = await saveAzimuth(merged);
  await saveExtraStore(store);
  return saved;
}

export async function loadConduitProduct() {
  return readJsonStore<Record<string, unknown>>(PRODUCT_ID, {});
}

export async function saveConduitProduct(product: unknown) {
  if (!product || typeof product !== "object") return;
  await writeJsonStore(PRODUCT_ID, product);
}

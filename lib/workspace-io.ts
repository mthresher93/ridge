import { prisma } from "./prisma";
import { azimuthToConduit, mergeConduitIntoAzimuth, parseConduitCrm } from "./conduit-bridge";
import { readJsonStore, writeJsonStore } from "./json-store";
import { hydrateSolar, persistSolar } from "./persist";
import { emptyWorkspace, isWorkspace, normalizeWorkspace } from "./seed";
import type { Workspace } from "./types";
import { logError } from "./http";
import { uid } from "./format";

const AZIMUTH_ID = "azimuth";
const EXTRA_ID = "conduit-ls";
const PRODUCT_ID = "conduit-product";

export class WorkspaceConflictError extends Error {
  workspace: Workspace;
  updatedAt: string;
  constructor(workspace: Workspace, updatedAt: string) {
    super("Workspace was updated elsewhere. Reloaded the saved copy.");
    this.name = "WorkspaceConflictError";
    this.workspace = workspace;
    this.updatedAt = updatedAt;
  }
}

export class WorkspaceCorruptError extends Error {
  constructor(message = "Workspace file is unreadable. Restore a backup from Settings.") {
    super(message);
    this.name = "WorkspaceCorruptError";
  }
}

async function backupWorkspace(payload: string, reason: string) {
  try {
    await prisma.workspaceBackup.create({
      data: { id: uid("bak"), payload, reason },
    });
    const extras = await prisma.workspaceBackup.findMany({ orderBy: { createdAt: "desc" }, skip: 10, select: { id: true } });
    if (extras.length) {
      await prisma.workspaceBackup.deleteMany({ where: { id: { in: extras.map((row) => row.id) } } });
    }
  } catch (error) {
    logError("backup", error);
  }
}

async function latestBackup(): Promise<Workspace | null> {
  try {
    const row = await prisma.workspaceBackup.findFirst({ orderBy: { createdAt: "desc" } });
    if (!row) return null;
    const parsed = JSON.parse(row.payload) as unknown;
    if (!isWorkspace(parsed)) return null;
    return normalizeWorkspace(parsed);
  } catch {
    return null;
  }
}

export async function loadAzimuth(): Promise<{ workspace: Workspace; updatedAt: string }> {
  const row = await prisma.workspaceStore.findUnique({ where: { id: AZIMUTH_ID } });
  if (!row) {
    const workspace = normalizeWorkspace(emptyWorkspace());
    workspace.revision = 1;
    const created = await prisma.workspaceStore.create({
      data: { id: AZIMUTH_ID, payload: JSON.stringify(workspace) },
    });
    await persistSolar(workspace).catch((error) => logError("persistSolar", error));
    return { workspace, updatedAt: created.updatedAt.toISOString() };
  }

  try {
    const parsed = JSON.parse(row.payload) as unknown;
    if (!isWorkspace(parsed)) {
      const restored = await latestBackup();
      if (restored) return { workspace: restored, updatedAt: row.updatedAt.toISOString() };
      throw new WorkspaceCorruptError();
    }
    const workspace = normalizeWorkspace(parsed as Workspace);
    if (workspace.version >= 3) {
      const hydrated = await hydrateSolar(workspace);
      await persistSolar(hydrated).catch((error) => logError("persistSolar", error));
      return { workspace: hydrated, updatedAt: row.updatedAt.toISOString() };
    }
    const migrated = { ...workspace, version: 3 };
    const saved = await saveAzimuth(migrated, { force: true });
    return { workspace: saved.workspace, updatedAt: saved.updatedAt };
  } catch (error) {
    if (error instanceof WorkspaceCorruptError) throw error;
    logError("loadAzimuth", error);
    const restored = await latestBackup();
    if (restored) return { workspace: restored, updatedAt: row.updatedAt.toISOString() };
    throw new WorkspaceCorruptError();
  }
}

export async function saveAzimuth(incoming: Workspace, opts?: { force?: boolean }) {
  const normalized = normalizeWorkspace({
    ...incoming,
    updatedAt: incoming.updatedAt || new Date().toISOString(),
  });

  const existing = await prisma.workspaceStore.findUnique({ where: { id: AZIMUTH_ID } });
  if (existing && !opts?.force) {
    try {
      const parsed = JSON.parse(existing.payload) as Workspace;
      const currentRev = Number(parsed.revision) || 0;
      const incomingRev = Number(normalized.revision) || 0;
      if (incomingRev < currentRev) {
        throw new WorkspaceConflictError(normalizeWorkspace(parsed), existing.updatedAt.toISOString());
      }
    } catch (error) {
      if (error instanceof WorkspaceConflictError) throw error;
    }
  }
  if (existing) await backupWorkspace(existing.payload, "pre-save");

  const next: Workspace = {
    ...normalized,
    revision: (Number(normalized.revision) || 0) + 1,
    updatedAt: new Date().toISOString(),
  };

  const row = await prisma.workspaceStore.upsert({
    where: { id: AZIMUTH_ID },
    update: { payload: JSON.stringify(next) },
    create: { id: AZIMUTH_ID, payload: JSON.stringify(next) },
  });
  await persistSolar(next).catch((error) => logError("persistSolar", error));
  return { ignored: false as const, updatedAt: row.updatedAt.toISOString(), workspace: next, revision: next.revision || 1 };
}

export async function restoreLatestBackup() {
  const restored = await latestBackup();
  if (!restored) throw new WorkspaceCorruptError("No backup available to restore.");
  return saveAzimuth(restored, { force: true });
}

export async function backupMeta() {
  try {
    const count = await prisma.workspaceBackup.count();
    const latest = await prisma.workspaceBackup.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, reason: true } });
    return { count, latestAt: latest?.createdAt.toISOString() || null, reason: latest?.reason || null };
  } catch {
    return { count: 0, latestAt: null, reason: null };
  }
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

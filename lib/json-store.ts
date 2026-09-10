import { prisma } from "./prisma";

export async function readJsonStore<T>(id: string, fallback: T): Promise<T> {
  const row = await prisma.workspaceStore.findUnique({ where: { id } });
  if (!row) return fallback;
  try {
    return JSON.parse(row.payload) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonStore(id: string, value: unknown) {
  const payload = JSON.stringify(value);
  await prisma.workspaceStore.upsert({
    where: { id },
    update: { payload },
    create: { id, payload },
  });
}

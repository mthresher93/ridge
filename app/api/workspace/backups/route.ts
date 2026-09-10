import { backupMeta, restoreLatestBackup } from "@/lib/workspace-io";
import { jsonError, jsonOk, logError } from "@/lib/http";

export async function GET() {
  try {
    return jsonOk(await backupMeta());
  } catch (error) {
    logError("GET /api/workspace/backups", error);
    return jsonError("Could not read backups", 500);
  }
}

export async function POST() {
  try {
    const saved = await restoreLatestBackup();
    return jsonOk({
      restored: true,
      updatedAt: saved.updatedAt,
      revision: saved.revision,
      workspace: saved.workspace,
    });
  } catch (error) {
    logError("POST /api/workspace/backups", error);
    return jsonError(error instanceof Error ? error.message : "Could not restore backup", 400);
  }
}

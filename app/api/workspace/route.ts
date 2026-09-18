import { NextResponse } from "next/server";
import { applyConduitStore, buildConduitStore, loadAzimuth, saveAzimuth, WorkspaceConflictError, WorkspaceCorruptError } from "@/lib/workspace-io";
import { isWorkspace, normalizeWorkspace } from "@/lib/seed";
import { jsonError, logError, readJson } from "@/lib/http";

export async function GET() {
  try {
    const { workspace, updatedAt } = await loadAzimuth();
    const store = await buildConduitStore(workspace);
    return NextResponse.json({ workspace, store, updatedAt, revision: workspace.revision || 0 });
  } catch (error) {
    logError("GET /api/workspace", error);
    if (error instanceof WorkspaceCorruptError) return jsonError(error.message, 500);
    return jsonError("Could not load workspace", 500);
  }
}

export async function PUT(request: Request) {
  const parsed = await readJson<{ workspace?: unknown; store?: Record<string, string> }>(request);
  if (!parsed.ok) return parsed.response;

  try {
    if (parsed.body.store && typeof parsed.body.store === "object") {
      const saved = await applyConduitStore(parsed.body.store);
      return NextResponse.json({
        ok: true,
        ignored: saved.ignored,
        updatedAt: saved.updatedAt,
        revision: saved.workspace.revision || 0,
      });
    }

    if (!isWorkspace(parsed.body.workspace)) {
      return jsonError("azimuth workspace required", 400);
    }

    const incoming = normalizeWorkspace({
      ...parsed.body.workspace,
      updatedAt: parsed.body.workspace.updatedAt || new Date().toISOString(),
    });
    const saved = await saveAzimuth(incoming);
    return NextResponse.json({
      ok: true,
      ignored: saved.ignored,
      updatedAt: saved.updatedAt,
      revision: saved.revision,
    });
  } catch (error) {
    if (error instanceof WorkspaceConflictError) {
      return NextResponse.json(
        { ok: false, conflict: true, error: error.message, workspace: error.workspace, updatedAt: error.updatedAt, revision: error.workspace.revision || 0 },
        { status: 409 },
      );
    }
    logError("PUT /api/workspace", error);
    return jsonError("Could not save workspace", 500);
  }
}

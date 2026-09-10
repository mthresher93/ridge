"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Activity, Workspace } from "./types";
import { emptyWorkspace, normalizeWorkspace } from "./seed";
import { nowIso, uid } from "./format";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

type WorkspaceContextValue = {
  workspace: Workspace;
  loading: boolean;
  loadError: string;
  saveStatus: SaveStatus;
  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;
  setWorkspace: (next: Workspace | ((prev: Workspace) => Workspace)) => void;
  log: (entityType: string, entityId: string, type: string, detail: string) => void;
  reset: () => void;
  reload: () => Promise<void>;
  retrySave: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

type PutResponse = {
  ok?: boolean;
  error?: string;
  ignored?: boolean;
  conflict?: boolean;
  updatedAt?: string;
  revision?: number;
  workspace?: Workspace;
};

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [workspace, setWorkspaceState] = useState<Workspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const savedTimer = useRef<number>(0);
  const inFlight = useRef(false);
  const pending = useRef<Workspace | null>(null);
  const latest = useRef<Workspace>(emptyWorkspace);

  const apply = useCallback((next: Workspace) => {
    const resolved = normalizeWorkspace(next);
    latest.current = resolved;
    setWorkspaceState(resolved);
    return resolved;
  }, []);

  const putWorkspace = useCallback(async (next: Workspace) => {
    const res = await fetch("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: next }),
    });
    let json: PutResponse = {};
    try {
      json = (await res.json()) as PutResponse;
    } catch {
      json = {};
    }
    if (res.status === 409 && json.workspace) {
      apply(json.workspace);
      pending.current = null;
      setSaveStatus("conflict");
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaveStatus("idle"), 2400);
      return;
    }
    if (!res.ok) throw new Error(json.error || "save failed");
    const revision = json.revision ?? json.workspace?.revision;
    const updatedAt = json.updatedAt || json.workspace?.updatedAt;
    if (revision != null || updatedAt) {
      setWorkspaceState((prev) => {
        if (prev.updatedAt !== next.updatedAt && prev.revision !== next.revision) {
          return { ...prev, revision: revision ?? prev.revision };
        }
        const synced = { ...next, revision: revision ?? next.revision, updatedAt: updatedAt || next.updatedAt };
        latest.current = synced;
        return synced;
      });
    }
    setSaveStatus("saved");
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaveStatus("idle"), 1600);
  }, [apply]);

  const flush = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaveStatus("saving");
    try {
      while (pending.current) {
        const toSave = pending.current;
        pending.current = null;
        await putWorkspace(toSave);
      }
    } catch {
      setSaveStatus("error");
    } finally {
      inFlight.current = false;
      if (pending.current) void flush();
    }
  }, [putWorkspace]);

  const persist = useCallback(
    (next: Workspace) => {
      pending.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void flush();
      }, 450);
    },
    [flush],
  );

  const reload = useCallback(async () => {
    setLoadError("");
    const res = await fetch("/api/workspace");
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error || "Could not load workspace");
    }
    const data = (await res.json()) as { workspace?: Workspace };
    if (!data.workspace) throw new Error("Workspace missing from server");
    const next = apply(normalizeWorkspace(data.workspace));
    setSelectedLeadId((current) => current || next.leads[0]?.id || null);
  }, [apply]);

  useEffect(() => {
    if (pathname === "/login") {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    reload()
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load workspace");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, pathname]);

  const setWorkspace = useCallback(
    (next: Workspace | ((prev: Workspace) => Workspace)) => {
      setWorkspaceState((prev) => {
        const resolved = normalizeWorkspace(typeof next === "function" ? next(prev) : next);
        latest.current = resolved;
        persist(resolved);
        return resolved;
      });
    },
    [persist],
  );

  const retrySave = useCallback(() => {
    pending.current = latest.current;
    void flush();
  }, [flush]);

  const log = useCallback(
    (entityType: string, entityId: string, type: string, detail: string) => {
      const activity: Activity = {
        id: uid("act"),
        entityType,
        entityId,
        type,
        detail,
        at: nowIso(),
      };
      setWorkspace((prev) => ({
        ...prev,
        activities: [activity, ...prev.activities].slice(0, 400),
        updatedAt: nowIso(),
      }));
    },
    [setWorkspace],
  );

  const reset = useCallback(() => {
    setWorkspace(emptyWorkspace());
  }, [setWorkspace]);

  const value = useMemo(
    () => ({
      workspace,
      loading,
      loadError,
      saveStatus,
      selectedLeadId,
      setSelectedLeadId,
      setWorkspace,
      log,
      reset,
      reload,
      retrySave,
    }),
    [workspace, loading, loadError, saveStatus, selectedLeadId, setWorkspace, log, reset, reload, retrySave],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

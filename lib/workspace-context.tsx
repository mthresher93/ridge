"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Activity, Workspace } from "./types";
import { createSeed, emptyWorkspace, normalizeWorkspace } from "./seed";
import { nowIso, uid } from "./format";

type WorkspaceContextValue = {
  workspace: Workspace;
  loading: boolean;
  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;
  setWorkspace: (next: Workspace | ((prev: Workspace) => Workspace)) => void;
  log: (entityType: string, entityId: string, type: string, detail: string) => void;
  reset: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const timer = useRef<number>(0);

  const persist = useCallback((next: Workspace) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: next }),
      }).catch(() => {});
    }, 200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.workspace) {
          const next = normalizeWorkspace(data.workspace as Workspace);
          setWorkspaceState(next);
          setSelectedLeadId((current) => current || next.leads[0]?.id || null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setWorkspace = useCallback(
    (next: Workspace | ((prev: Workspace) => Workspace)) => {
      setWorkspaceState((prev) => {
        const resolved = normalizeWorkspace(typeof next === "function" ? next(prev) : next);
        persist(resolved);
        return resolved;
      });
    },
    [persist],
  );

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
    setWorkspace(createSeed());
  }, [setWorkspace]);

  const value = useMemo(
    () => ({ workspace, loading, selectedLeadId, setSelectedLeadId, setWorkspace, log, reset }),
    [workspace, loading, selectedLeadId, setWorkspace, log, reset],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

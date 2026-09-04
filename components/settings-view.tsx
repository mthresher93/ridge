"use client";

import { useWorkspace } from "@/lib/workspace-context";
import type { Density } from "@/lib/types";
import { PageDesk } from "./page-desk";

export function SettingsView() {
  const { workspace, setWorkspace, reset } = useWorkspace();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorkspace((prev) => ({
      ...prev,
      settings: {
        operator: String(data.get("operator") || prev.settings.operator),
        defaultOwner: String(data.get("defaultOwner") || prev.settings.defaultOwner),
        dialTarget: Number(data.get("dialTarget")) || 80,
        density: (String(data.get("density")) as Density) || "comfortable",
      },
    }));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ridge-workspace.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageDesk>
      <div className="az-fill settings-desk" style={{ gridTemplateRows: "auto minmax(0,1fr)" }}>
        <div>
          <div className="az-kicker">Workspace</div>
          <div className="az-title">Settings</div>
        </div>
        <form className="settings-grid" onSubmit={save}>
          <section className="az-panel p-4 space-y-3 overflow-auto">
            <h2 className="text-[13px] font-semibold">Operator</h2>
            <label className="block text-[12px] text-[var(--muted)]">
              Name
              <input name="operator" className="az-input mt-1" defaultValue={workspace.settings.operator} />
            </label>
            <label className="block text-[12px] text-[var(--muted)]">
              Default owner
              <input name="defaultOwner" className="az-input mt-1" defaultValue={workspace.settings.defaultOwner} />
            </label>
          </section>
          <section className="az-panel p-4 space-y-3 overflow-auto">
            <h2 className="text-[13px] font-semibold">Dialer</h2>
            <label className="block text-[12px] text-[var(--muted)]">
              Daily dial target
              <input name="dialTarget" type="number" className="az-input mt-1" defaultValue={workspace.settings.dialTarget} />
            </label>
            <p className="text-[12px] text-[var(--muted)]">Used on Reports. Audio devices are set on the Dialer Audio menu.</p>
          </section>
          <section className="az-panel p-4 space-y-3 overflow-auto">
            <h2 className="text-[13px] font-semibold">Display</h2>
            <label className="block text-[12px] text-[var(--muted)]">
              Density
              <select name="density" className="az-select mt-1" defaultValue={workspace.settings.density}>
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <button className="az-btn pri">Save</button>
          </section>
          <section className="az-panel p-4 space-y-3">
            <h2 className="text-[13px] font-semibold">Data</h2>
            <p className="text-[12px] text-[var(--muted)] leading-relaxed">
              Designs, proposals, and call wraps write to SQLite. The original Conduit console shares this same workspace.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                className="az-btn"
                href="/conduit-crm/index.html"
                onClick={(event) => {
                  event.preventDefault();
                  window.location.assign("/conduit-crm/index.html");
                }}
              >
                Open Conduit console
              </a>
              <button type="button" className="az-btn" onClick={exportJson}>
                Export JSON
              </button>
              <button
                type="button"
                className="az-btn danger"
                onClick={() => {
                  if (confirm("Restore Ridge starter records? This replaces the current workspace.")) reset();
                }}
              >
                Restore starter records
              </button>
            </div>
          </section>
        </form>
      </div>
    </PageDesk>
  );
}

"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import type { Density } from "@/lib/types";
import { PageDesk } from "./page-desk";

type SettingsTab = "profile" | "dialer" | "display" | "data";

const TABS: { id: SettingsTab; label: string; blurb: string }[] = [
  { id: "profile", label: "Profile", blurb: "Who owns dials and new contacts" },
  { id: "dialer", label: "Dialer", blurb: "Pace targets and microphone" },
  { id: "display", label: "Display", blurb: "Density across the desk" },
  { id: "data", label: "Data", blurb: "Export, restore, and Conduit" },
];

export function SettingsView() {
  const { workspace, setWorkspace, reset } = useWorkspace();
  const [tab, setTab] = useState<SettingsTab>("profile");
  const [savedFlash, setSavedFlash] = useState(false);
  const [showDanger, setShowDanger] = useState(false);

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
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
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

  const active = TABS.find((item) => item.id === tab) || TABS[0];

  return (
    <PageDesk>
      <div className="az-fill settings-desk">
        <header className="settings-head">
          <div>
            <div className="az-title">Settings</div>
            <p className="settings-sub">Desk preferences for this workspace. Changes save to SQLite with the rest of Ridge.</p>
          </div>
          {savedFlash ? <span className="settings-flash">Saved</span> : null}
        </header>

        <div className="settings-layout">
          <nav className="settings-rail" aria-label="Settings categories">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`settings-rail-btn ${tab === item.id ? "on" : ""}`}
                onClick={() => setTab(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.blurb}</small>
              </button>
            ))}
          </nav>

          <form className="settings-pane" onSubmit={save} key={tab}>
            <div className="settings-pane-head">
              <h2>{active.label}</h2>
              <p>{active.blurb}</p>
            </div>

            {tab === "profile" ? (
              <div className="settings-fields">
                <label className="settings-field">
                  <span>Operator name</span>
                  <input name="operator" className="az-input" defaultValue={workspace.settings.operator} />
                  <small>Shown on session chrome and activity notes.</small>
                </label>
                <label className="settings-field">
                  <span>Default owner</span>
                  <input name="defaultOwner" className="az-input" defaultValue={workspace.settings.defaultOwner} />
                  <small>Assigned when you add a contact or board deal.</small>
                </label>
                <input type="hidden" name="dialTarget" value={workspace.settings.dialTarget} />
                <input type="hidden" name="density" value={workspace.settings.density} />
              </div>
            ) : null}

            {tab === "dialer" ? (
              <div className="settings-fields">
                <label className="settings-field">
                  <span>Daily dial target</span>
                  <input name="dialTarget" type="number" min={1} className="az-input" defaultValue={workspace.settings.dialTarget} />
                  <small>Pace line on Dialer and Reports.</small>
                </label>
                <div className="settings-note">
                  <strong>Microphone</strong>
                  <p>
                    Pick input/output devices from the Dialer <em>Audio</em> control. Settings only stores the pace target —
                    live device tests stay next to the call stage.
                  </p>
                </div>
                <input type="hidden" name="operator" value={workspace.settings.operator} />
                <input type="hidden" name="defaultOwner" value={workspace.settings.defaultOwner} />
                <input type="hidden" name="density" value={workspace.settings.density} />
              </div>
            ) : null}

            {tab === "display" ? (
              <div className="settings-fields">
                <label className="settings-field">
                  <span>Density</span>
                  <select name="density" className="az-select" defaultValue={workspace.settings.density}>
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                  </select>
                  <small>Tightens spacing on Dialer, Board, Contacts, and Design.</small>
                </label>
                <input type="hidden" name="operator" value={workspace.settings.operator} />
                <input type="hidden" name="defaultOwner" value={workspace.settings.defaultOwner} />
                <input type="hidden" name="dialTarget" value={workspace.settings.dialTarget} />
              </div>
            ) : null}

            {tab === "data" ? (
              <div className="settings-fields">
                <div className="settings-note">
                  <strong>Workspace storage</strong>
                  <p>
                    Contacts, queue history, dispositions, follow-ups, designs, and proposals write to SQLite. The original
                    Conduit console shares this same workspace.
                  </p>
                </div>
                <div className="settings-actions">
                  <button type="button" className="az-btn" onClick={exportJson}>
                    Export JSON
                  </button>
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
                </div>
                <div className="settings-disclosure">
                  <button type="button" className="settings-disclosure-toggle" onClick={() => setShowDanger((v) => !v)}>
                    {showDanger ? "Hide restore options" : "Restore options"}
                  </button>
                  {showDanger ? (
                    <div className="settings-danger">
                      <p>Restoring starter records replaces the current workspace. Export first if you need a backup.</p>
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
                  ) : null}
                </div>
                <input type="hidden" name="operator" value={workspace.settings.operator} />
                <input type="hidden" name="defaultOwner" value={workspace.settings.defaultOwner} />
                <input type="hidden" name="dialTarget" value={workspace.settings.dialTarget} />
                <input type="hidden" name="density" value={workspace.settings.density} />
              </div>
            ) : null}

            {tab !== "data" ? (
              <div className="settings-footer">
                <button className="az-btn pri" type="submit">
                  Save {active.label.toLowerCase()}
                </button>
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </PageDesk>
  );
}

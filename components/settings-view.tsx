"use client";

import { useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import type { Density } from "@/lib/types";
import { Station } from "./page-intro";

type SettingsTab = "appearance" | "profile" | "dialer" | "integrations" | "data";

const TABS: { id: SettingsTab; label: string; blurb: string }[] = [
  { id: "appearance", label: "Appearance", blurb: "Density and desk chrome" },
  { id: "profile", label: "Operator", blurb: "Who owns dials and new records" },
  { id: "dialer", label: "Dialer policy", blurb: "Pace, window, consent" },
  { id: "integrations", label: "Integrations", blurb: "Ledger of what is actually live" },
  { id: "data", label: "Data", blurb: "Export, restore, honesty" },
];

export function SettingsView() {
  const { workspace, setWorkspace, reset } = useWorkspace();
  const [tab, setTab] = useState<SettingsTab>("appearance");
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
    a.download = "current-workspace.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const active = TABS.find((item) => item.id === tab) || TABS[0];

  return (
    <Station
      n="16"
      title="Settings"
      fill
      lede={
        <>
          Desk policy for this local workspace. <em>Changes save to SQLite with the rest of Current.</em>
        </>
      }
      chip={savedFlash ? "SAVED" : "LOCAL APP"}
    >
      <div className="settings-layout current-settings">
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

          {tab === "appearance" ? (
            <div className="settings-fields">
              <label className="settings-field">
                <span>Density</span>
                <select name="density" className="az-select" defaultValue={workspace.settings.density}>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
                <small>Tightens Dialer, Pipeline, Leads, and Design.</small>
              </label>
              <div className="settings-note">
                <strong>Theme</strong>
                <p>Current ships one night desk: cyan, violet, Orbitron. Color pickers are not persisted yet.</p>
              </div>
              <input type="hidden" name="operator" value={workspace.settings.operator} />
              <input type="hidden" name="defaultOwner" value={workspace.settings.defaultOwner} />
              <input type="hidden" name="dialTarget" value={workspace.settings.dialTarget} />
            </div>
          ) : null}

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
                <small>Assigned when you add a lead or board deal.</small>
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
                <small>Pace line on Dialer and KPI.</small>
              </label>
              <div className="settings-note">
                <strong>Window · West Coast</strong>
                <p>Live window is 6:30am–8:00pm PT, weekdays. Weekend is closed. Current will not pretend a carrier is connected.</p>
              </div>
              <div className="settings-note">
                <strong>Consent / DNC</strong>
                <p>Unverified consent and internal DNC block the Dial button. Device tests stay on the Dialer Audio control.</p>
              </div>
              <input type="hidden" name="operator" value={workspace.settings.operator} />
              <input type="hidden" name="defaultOwner" value={workspace.settings.defaultOwner} />
              <input type="hidden" name="density" value={workspace.settings.density} />
            </div>
          ) : null}

          {tab === "integrations" ? (
            <div className="settings-fields">
              {[
                ["Workspace SQLite", "Live", "Leads, pipeline, designs, events persist locally."],
                ["Telephony", "Blocked", "No carrier. Dialer is a local simulation."],
                ["Maps / tiles", "Live", "OSM streets and Esri satellite in Design and Map."],
                ["Geocode", "Local + OSM", "City atlas first, OSM fallback."],
                ["AI model", "Local only", "AI Studio is deterministic. No remote inference."],
                ["Ad platforms", "Blocked", "Ads stay drafts. Zero spend."],
                ["Payments", "Blocked", "Money is recorded pipeline, not a processor."],
              ].map(([name, state, detail]) => (
                <div key={name} className="cd-row">
                  <div>
                    <b>{name}</b>
                    <div className="cd-mono">{detail}</div>
                  </div>
                  <span className={`cd-chip ${state === "Live" || state.startsWith("Local") ? "ok" : "wn"}`}>{state}</span>
                </div>
              ))}
              <input type="hidden" name="operator" value={workspace.settings.operator} />
              <input type="hidden" name="defaultOwner" value={workspace.settings.defaultOwner} />
              <input type="hidden" name="dialTarget" value={workspace.settings.dialTarget} />
              <input type="hidden" name="density" value={workspace.settings.density} />
            </div>
          ) : null}

          {tab === "data" ? (
            <div className="settings-fields">
              <div className="settings-note">
                <strong>Workspace storage</strong>
                <p>
                  Leads, queue history, dispositions, follow-ups, designs, and proposals write to SQLite. Internal store id stays
                  azimuth so existing records still load.
                </p>
              </div>
              <div className="settings-actions">
                <button type="button" className="az-btn" onClick={exportJson}>
                  Export JSON
                </button>
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
                        if (confirm("Restore Current starter records? This replaces the current workspace.")) reset();
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

          {tab !== "data" && tab !== "integrations" ? (
            <div className="settings-footer">
              <button className="az-btn pri" type="submit">
                Save {active.label.toLowerCase()}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </Station>
  );
}

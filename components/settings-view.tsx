"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { settingsWithDefaults, type Accent, type Density, type ScriptModeSetting, type Settings } from "@/lib/types";

type SettingsTab = "account" | "dialer" | "display" | "workspace";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "dialer", label: "Dialer" },
  { id: "display", label: "Display" },
  { id: "workspace", label: "Workspace" },
];

const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "cyan", label: "Ember", swatch: "#c2410c" },
  { id: "violet", label: "Violet", swatch: "#7c4dff" },
  { id: "amber", label: "Amber", swatch: "#ffab00" },
  { id: "teal", label: "Teal", swatch: "#00bfa5" },
];

type Draft = Required<Settings>;

export function SettingsView() {
  const { workspace, setWorkspace, reset } = useWorkspace();
  const [tab, setTab] = useState<SettingsTab>("account");
  const [draft, setDraft] = useState<Draft>(() => settingsWithDefaults(workspace.settings));
  const [savedFlash, setSavedFlash] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [phoneLink, setPhoneLink] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    setDraft(settingsWithDefaults(workspace.settings));
  }, [workspace.settings]);

  useEffect(() => {
    if (tab !== "workspace" || phoneLink) return;
    fetch("/api/telephony/compliance")
      .then((res) => res.json())
      .then((json: { liveReady?: boolean; detail?: string }) =>
        setPhoneLink({
          ok: !!json.liveReady,
          detail: (json.detail || "Phone is not connected.").replace(/\bCurrent\b/g, "Lumen").replace(/\bazimuth\b/gi, "this workspace"),
        }),
      )
      .catch(() => setPhoneLink({ ok: false, detail: "Could not check phone connection." }));
  }, [tab, phoneLink]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settingsWithDefaults(workspace.settings));

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function save(event?: React.FormEvent) {
    event?.preventDefault();
    setWorkspace((prev) => ({ ...prev, settings: { ...draft, dialTarget: Math.max(1, Number(draft.dialTarget) || 80) } }));
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1600);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lumen-workspace.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const counts = {
    contacts: workspace.leads.length,
    calls: (workspace.callLogs || []).length,
    projects: Object.keys(workspace.designs || {}).length,
    proposals: Object.keys(workspace.proposals || {}).length,
  };

  return (
    <div className={`settings-desk ${dirty ? "is-dirty" : ""}`}>
      <header className="settings-top">
        <h1>Settings</h1>
        <span className="settings-status">{savedFlash ? "Saved" : dirty ? "Unsaved" : "Up to date"}</span>
        <div className="settings-top-actions">
          {dirty ? (
            <button type="button" className="az-btn" onClick={() => setDraft(settingsWithDefaults(workspace.settings))}>
              Discard
            </button>
          ) : null}
          <button type="button" className={`az-btn ${dirty ? "pri" : ""}`} disabled={!dirty} onClick={() => save()}>
            Save
          </button>
        </div>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="Settings">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "on" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form className="settings-body" onSubmit={save}>
        {tab === "account" ? (
          <section className="st-list">
            <Row label="Your name" hint="Used on call notes, appointments, and follow-ups.">
              <input className="az-input" value={draft.operator} onChange={(e) => set("operator", e.target.value)} />
            </Row>
            <Row label="Default owner" hint="Assigned when you add a contact or a deal.">
              <input className="az-input" value={draft.defaultOwner} onChange={(e) => set("defaultOwner", e.target.value)} />
            </Row>
          </section>
        ) : null}

        {tab === "dialer" ? (
          <section className="st-list">
            <Row label="Daily dial goal" hint="Shown on the Dialer pace bar.">
              <input
                className="az-input st-narrow"
                type="number"
                min={1}
                value={draft.dialTarget}
                onChange={(e) => set("dialTarget", Number(e.target.value))}
              />
            </Row>
            <Row label="Calling hours" hint="Pacific time. Weekends stay closed.">
              <div className="st-pair">
                <input type="time" className="az-input" value={draft.dialWindowStart} onChange={(e) => set("dialWindowStart", e.target.value)} />
                <span>to</span>
                <input type="time" className="az-input" value={draft.dialWindowEnd} onChange={(e) => set("dialWindowEnd", e.target.value)} />
              </div>
            </Row>
            <Row label="Dialer layout" hint="How Dialer opens: call, split with script, or script first.">
              <div className="st-seg" role="radiogroup">
                {(["collapsed", "split", "focus"] as ScriptModeSetting[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={draft.defaultScriptMode === mode}
                    className={draft.defaultScriptMode === mode ? "on" : ""}
                    onClick={() => set("defaultScriptMode", mode)}
                  >
                    {mode === "collapsed" ? "Call" : mode === "split" ? "Split" : "Script"}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Time between calls" hint="After you save a disposition, wait this long before the next number.">
              <div className="st-range">
                <input
                  type="range"
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={draft.powerDelaySec}
                  onChange={(e) => set("powerDelaySec", Number(e.target.value))}
                />
                <b className="az-num">{draft.powerDelaySec.toFixed(1)}s</b>
              </div>
            </Row>
            <Row label="Confirm before each call" hint="Asks once when Power is off.">
              <Toggle on={draft.confirmBeforeDial} onChange={(v) => set("confirmBeforeDial", v)} />
            </Row>
            <p className="st-fine">
              Microphone and speaker are under Audio on the Dialer. Contacts without verified consent or on the DNC list stay blocked.
            </p>
          </section>
        ) : null}

        {tab === "display" ? (
          <section className="st-list">
            <Row label="Density" hint="Compact tightens lists on Dialer, Pipeline, Contacts, and Design.">
              <div className="st-seg" role="radiogroup">
                {(["comfortable", "compact"] as Density[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={draft.density === d}
                    className={draft.density === d ? "on" : ""}
                    onClick={() => set("density", d)}
                  >
                    {d === "comfortable" ? "Comfortable" : "Compact"}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Accent" hint="Color for primary buttons and the active state.">
              <div className="st-swatches" role="radiogroup">
                {ACCENTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={draft.accent === item.id}
                    className={draft.accent === item.id ? "on" : ""}
                    onClick={() => set("accent", item.id)}
                  >
                    <i style={{ background: item.swatch }} />
                    {item.label}
                  </button>
                ))}
              </div>
            </Row>
          </section>
        ) : null}

        {tab === "workspace" ? (
          <section className="st-list">
            <p className="st-fine">
              {counts.contacts} contacts · {counts.calls} calls · {counts.projects} projects · {counts.proposals} proposals
            </p>
            <div className="st-ledger">
              {[
                ["Phone", phoneLink ? (phoneLink.ok ? "Connected" : "Not connected") : "Checking…", phoneLink?.detail || "Checking phone connection."],
                ["Local save", "On", "Contacts, pipeline, projects, and call history stay on this computer."],
                ["Maps", "On", "Street and satellite tiles in Design and Map."],
                ["Address lookup", "On", "City list first, then OpenStreetMap."],
                ["Studio", "Local", "Drafts from the record only. Nothing is sent out."],
                ["Ads", "Off", "Campaigns stay drafts. No spend."],
                ["Payments", "Off", "Revenue is recorded pipeline, not a processor."],
              ].map(([name, state, detail]) => (
                <div key={name} className="st-ledger-row">
                  <div>
                    <b>{name}</b>
                    <span>{detail}</span>
                  </div>
                  <em className={state === "On" || state === "Connected" || state === "Local" ? "ok" : ""}>{state}</em>
                </div>
              ))}
            </div>
            <Row label="Backup" hint="Download contacts, call history, follow-ups, projects, proposals, and these settings.">
              <button type="button" className="az-btn" onClick={exportJson}>
                Export
              </button>
            </Row>
            <Row label="Sample data" hint="Replaces everything in this workspace.">
              <button type="button" className="st-disclose" onClick={() => setShowRestore((v) => !v)}>
                {showRestore ? "Hide" : "Show"}
              </button>
            </Row>
            {showRestore ? (
              <div className="st-danger">
                <p>Export first if you need a copy. This cannot be undone.</p>
                <button
                  type="button"
                  className="az-btn danger"
                  onClick={() => {
                    if (confirm("Restore sample data? This replaces the current workspace.")) reset();
                  }}
                >
                  Restore sample data
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </form>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="st-row">
      <span className="st-row-copy">
        <b>{label}</b>
        {hint ? <small>{hint}</small> : null}
      </span>
      <span className="st-row-ctrl">{children}</span>
    </label>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`st-toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <i />
      <span>{on ? "On" : "Off"}</span>
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { settingsWithDefaults, type Accent, type Density, type ScriptModeSetting, type Settings } from "@/lib/types";
import { MESSAGE_HARD_WARN, MESSAGE_SOFT_CAP } from "@/lib/pacing";

type SettingsTab = "account" | "dialer" | "display" | "workspace" | "ai" | "connect";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "connect", label: "Connect" },
  { id: "ai", label: "AI" },
  { id: "dialer", label: "Calling" },
  { id: "display", label: "Display" },
  { id: "workspace", label: "Workspace" },
];

const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "cyan", label: "Brass", swatch: "#e2b84a" },
  { id: "violet", label: "Violet", swatch: "#7c4dff" },
  { id: "amber", label: "Amber", swatch: "#ffab00" },
  { id: "teal", label: "Teal", swatch: "#00bfa5" },
];

type Draft = Required<Settings>;

export function SettingsView() {
  const { workspace, setWorkspace, reset, reload } = useWorkspace();
  const [tab, setTab] = useState<SettingsTab>("account");
  const [draft, setDraft] = useState<Draft>(() => settingsWithDefaults(workspace.settings));
  const [savedFlash, setSavedFlash] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [phoneLink, setPhoneLink] = useState<{ ok: boolean; detail: string } | null>(null);
  const [backupInfo, setBackupInfo] = useState<{ count: number; latestAt: string | null } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const [aiStatus, setAiStatus] = useState<{ ready?: boolean; provider?: string; ollama?: { detail?: string }; openrouter?: { detail?: string }; pull?: string; bookmarklet?: string } | null>(null);
  const [aiMsg, setAiMsg] = useState("");
  const [connectMsg, setConnectMsg] = useState("");
  const [connectBusy, setConnectBusy] = useState("");

  useEffect(() => {
    setDraft(settingsWithDefaults(workspace.settings));
  }, [workspace.settings]);

  useEffect(() => {
    if (tab !== "ai") return;
    fetch("/api/ai/status")
      .then((res) => res.json())
      .then((json) => setAiStatus(json))
      .catch(() => setAiStatus({ ready: false, provider: "rules" }));
  }, [tab]);

  useEffect(() => {
    if (tab !== "workspace") return;
    fetch("/api/workspace/backups")
      .then((res) => res.json())
      .then((json) => setBackupInfo({ count: Number(json.count) || 0, latestAt: json.latestAt || null }))
      .catch(() => setBackupInfo({ count: 0, latestAt: null }));
  }, [tab, workspace.updatedAt]);

  useEffect(() => {
    if (tab !== "workspace" || phoneLink) return;
    fetch("/api/telephony/compliance")
      .then((res) => res.json())
      .then((json: { liveReady?: boolean; detail?: string }) =>
        setPhoneLink({
          ok: !!json.liveReady,
          detail: (json.detail || "Phone is not connected.").replace(/\bCurrent\b/g, "Haul").replace(/\bazimuth\b/gi, "this workspace"),
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
    a.download = "move-workspace.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const counts = {
    contacts: workspace.leads.length,
    calls: (workspace.callLogs || []).length,
    listings: (workspace.listings || []).length,
    shipments: (workspace.shipments || []).length,
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
            <Row label="Your name" hint="Used on notes, follow-ups, and call logs.">
              <input className="az-input" value={draft.operator} onChange={(e) => set("operator", e.target.value)} />
            </Row>
            <Row label="Default owner" hint="Assigned when you add a prospect or opportunity.">
              <input className="az-input" value={draft.defaultOwner} onChange={(e) => set("defaultOwner", e.target.value)} />
            </Row>
            <p className="st-fine">
              Haul is a desk, not a bot. You hunt public pages, capture what you see, label yards vs private, and send from your own accounts. Localhost is enough — no custom domain. Trailer matching uses training caps, not a carrier quote.
            </p>
            <Row label="Session" hint="Sign out of this browser when a workspace password is set.">
              <button
                type="button"
                className="az-btn"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.assign("/login");
                }}
              >
                Sign out
              </button>
            </Row>
          </section>
        ) : null}

        {tab === "connect" ? (
          <section className="st-list">
            <p className="st-fine">
              Point Haul at a free JSON API on the company site you join — locations, customers, or loads. GET only. If they only have a website, keep using Discover paste. DAT and scraping stay off.
            </p>
            <Row label="JSON endpoint" hint="Full URL from their docs. Example: https://their-desk.com/api/locations">
              <input
                className="az-input"
                value={draft.companyApiUrl}
                onChange={(event) => set("companyApiUrl", event.target.value)}
                placeholder="https://example.com/api/locations"
              />
            </Row>
            <Row label="Auth" hint="Most public APIs need none. Use a key only if they issued you a free token.">
              <select className="az-select" value={draft.companyApiAuth} onChange={(event) => set("companyApiAuth", event.target.value as Draft["companyApiAuth"])}>
                <option value="none">None (public JSON)</option>
                <option value="bearer">Bearer token</option>
                <option value="query">Query api_key</option>
              </select>
            </Row>
            <Row label="Key" hint="Stays in this workspace on this computer. Do not paste a paid DAT or Truckstop key.">
              <input
                className="az-input"
                type="password"
                autoComplete="off"
                value={draft.companyApiKey}
                onChange={(event) => set("companyApiKey", event.target.value)}
                placeholder={draft.companyApiAuth === "none" ? "Leave blank" : "Token they gave you"}
              />
            </Row>
            <Row label="Test" hint="Reads JSON. Does not save clients until you pull.">
              <button
                type="button"
                className="az-btn"
                disabled={!draft.companyApiUrl.trim() || Boolean(connectBusy)}
                onClick={async () => {
                  setConnectBusy("probe");
                  setConnectMsg("");
                  try {
                    const res = await fetch("/api/connect", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "probe",
                        url: draft.companyApiUrl,
                        auth: draft.companyApiAuth,
                        key: draft.companyApiKey,
                      }),
                    });
                    const json = (await res.json()) as { ok?: boolean; error?: string; usable?: number; records?: number; sampleName?: string };
                    setConnectMsg(
                      json.ok
                        ? `JSON ok · ${json.usable || 0} usable of ${json.records || 0}${json.sampleName ? ` · e.g. ${json.sampleName}` : ""}`
                        : json.error || "Could not read that URL.",
                    );
                  } catch {
                    setConnectMsg("Could not reach Haul.");
                  }
                  setConnectBusy("");
                }}
              >
                {connectBusy === "probe" ? "Testing…" : "Test connection"}
              </button>
            </Row>
            <Row label="Pull into book" hint="Same merge rules as paste: published phone merges, no invented numbers. Max 40 rows.">
              <button
                type="button"
                className="az-btn pri"
                disabled={!draft.companyApiUrl.trim() || Boolean(connectBusy)}
                onClick={async () => {
                  if (dirty) save();
                  setConnectBusy("pull");
                  setConnectMsg("");
                  try {
                    const res = await fetch("/api/connect", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "pull",
                        url: draft.companyApiUrl,
                        auth: draft.companyApiAuth,
                        key: draft.companyApiKey,
                      }),
                    });
                    const json = (await res.json()) as { ok?: boolean; error?: string; created?: number; merged?: number };
                    if (json.ok) {
                      await reload();
                      setConnectMsg(`Pulled · ${json.created || 0} new · ${json.merged || 0} merged`);
                    } else {
                      setConnectMsg(json.error || "Pull failed.");
                    }
                  } catch {
                    setConnectMsg("Could not pull.");
                  }
                  setConnectBusy("");
                }}
              >
                {connectBusy === "pull" ? "Pulling…" : "Pull into Clients"}
              </button>
            </Row>
            {connectMsg ? <p className="rec-import-msg">{connectMsg}</p> : null}
            <p className="st-fine">
              Inbound is also free: their site can POST JSON to /api/prospects/capture with sellerName, phone (only if published), city, and url. Optional header x-capture-token if you set CAPTURE_TOKEN.
            </p>
          </section>
        ) : null}

        {tab === "ai" ? (
          <section className="st-list">
            <Row label="Classifier" hint={aiStatus?.ready ? "Used when you paste or bookmarklet-capture a listing." : "Local rules run until Ollama or OpenRouter is up."}>
              <em className={aiStatus?.ready ? "ok" : ""}>{aiStatus?.provider || "checking"}</em>
            </Row>
            <p className="st-fine">{aiStatus?.ollama?.detail || "Checking Ollama…"}</p>
            <p className="st-fine">{aiStatus?.openrouter?.detail}</p>
            <Row label="Install Qwen" hint="Free, local, one user. qwen3-coder:30b is already on this machine.">
              <button
                type="button"
                className="az-btn"
                onClick={async () => {
                  const cmd = aiStatus?.pull || "ollama pull qwen3-coder:30b";
                  try {
                    await navigator.clipboard.writeText(cmd);
                    setAiMsg(`Copied: ${cmd}`);
                  } catch {
                    setAiMsg(cmd);
                  }
                }}
              >
                Copy ollama pull
              </button>
            </Row>
            <Row label="Capture bookmarklet" hint="Save as a bookmark. Open a listing you are allowed to view, click the bookmark, it posts into Discover.">
              <button
                type="button"
                className="az-btn"
                onClick={async () => {
                  if (!aiStatus?.bookmarklet) return;
                  try {
                    await navigator.clipboard.writeText(aiStatus.bookmarklet);
                    setAiMsg("Bookmarklet copied. Paste it into a bookmark URL.");
                  } catch {
                    setAiMsg("Clipboard blocked.");
                  }
                }}
              >
                Copy bookmarklet
              </button>
            </Row>
            {aiMsg ? <p className="rec-import-msg">{aiMsg}</p> : null}
            <p className="st-fine">
              Defaults to qwen3-coder:30b on this machine. Override with OLLAMA_MODEL in .env. Optional: OPENROUTER_API_KEY for a cloud fallback. Haul never logs into Facebook for you. Trailer picks still run from the Intel math if Ollama is down.
            </p>
          </section>
        ) : null}

        {tab === "dialer" ? (
          <section className="st-list">
            <Row label="Daily outreach goal" hint="Personal pace target, not a dialer quota.">
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
              Outreach is copy-and-send. Soft cap {MESSAGE_SOFT_CAP} marked-sent per day, warning at {MESSAGE_HARD_WARN}. The daily outreach goal above is your personal pace, not a dialer quota. Microphone and speaker stay on the legacy dialer if you still use it. Log calls from the prospect record.
            </p>
          </section>
        ) : null}

        {tab === "display" ? (
          <section className="st-list">
            <Row label="Density" hint="Compact tightens lists on Clients, Pipeline, and Outreach.">
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
              {counts.contacts} prospects · {counts.listings} listings · {counts.shipments} shipments · {counts.calls} logged calls
            </p>
            <div className="st-ledger">
              {[
                ["Phone", phoneLink ? (phoneLink.ok ? "Connected" : "Not connected") : "Checking…", phoneLink?.detail || "Checking phone connection."],
                ["Local save", "On", "Clients, pipeline, listings, follow-ups, and shipments stay on this computer."],
                ["AI scoring", "Local", "Rules first. Optional: Ollama qwen3-coder:30b on this machine. No paid API required."],
                ["APIs", "None", "Do not buy Facebook, DAT, or Maps APIs. Hunt is a normal browser tab you click. Ollama is optional and local."],
                ["Capture", "Manual", "Paste, CSV, or the bookmarklet on a page you already opened. POST /api/prospects/capture is for that same flow."],
                ["Trailer math", "On", "Intel uses published deck caps (HS 40'/20k/10.6'). It will not put a sleeper on a hotshot. Confirm the photo before you quote."],
                ["Outreach pace", "On", `Soft cap ${MESSAGE_SOFT_CAP} messages/day, warning at ${MESSAGE_HARD_WARN}. You send. Variants rotate. No Messenger bots.`],
                ["Will not do", "Off", "No Facebook/Craigslist scraping, no CAPTCHA bypass, no invented phones, emails, or freight rates. Listing ask ≠ your rate."],
                ["Payments", "Off", "Margin is recorded on shipments, not a processor."],
              ].map(([name, state, detail]) => (
                <div key={name} className="st-ledger-row">
                  <div>
                    <b>{name}</b>
                    <span>{detail}</span>
                  </div>
                  <em className={state === "On" || state === "Connected" || state === "Local" || state === "Manual" || state === "None" ? "ok" : ""}>{state}</em>
                </div>
              ))}
            </div>
            <Row label="Backup" hint={backupInfo?.latestAt ? `${backupInfo.count} snapshots. Latest ${new Date(backupInfo.latestAt).toLocaleString()}.` : "Download a JSON copy, or restore the last automatic snapshot."}>
              <span className="st-row-ctrl" style={{ display: "flex", gap: 8 }}>
                <button type="button" className="az-btn" onClick={exportJson}>
                  Export
                </button>
                <button
                  type="button"
                  className="az-btn"
                  disabled={backupBusy || !backupInfo?.count}
                  onClick={async () => {
                    if (!confirm("Restore the last automatic backup? Unsaved edits since that snapshot will be replaced.")) return;
                    setBackupBusy(true);
                    setBackupMsg("");
                    try {
                      const res = await fetch("/api/workspace/backups", { method: "POST" });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error || "Restore failed");
                      await reload();
                      setBackupMsg("Restored the last snapshot.");
                    } catch (error) {
                      setBackupMsg(error instanceof Error ? error.message : "Restore failed");
                    } finally {
                      setBackupBusy(false);
                    }
                  }}
                >
                  {backupBusy ? "Restoring…" : "Restore last snapshot"}
                </button>
              </span>
            </Row>
            {backupMsg ? <p className="rec-import-msg">{backupMsg}</p> : null}
            <Row label="Clear workspace" hint="Deletes every client, listing, and quote. No sample data is loaded back.">
              <button type="button" className="st-disclose" onClick={() => setShowRestore((v) => !v)}>
                {showRestore ? "Hide" : "Show"}
              </button>
            </Row>
            {showRestore ? (
              <div className="st-danger">
                <p>Export first if you need a copy. This cannot be undone. The desk will be empty.</p>
                <button
                  type="button"
                  className="az-btn danger"
                  onClick={() => {
                    if (confirm("Clear this workspace? All clients and quotes will be deleted. No mock data will be restored.")) reset();
                  }}
                >
                  Clear workspace
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { CLIENT_KINDS, LEAD_SOURCES, ingestCapture, suggestClientKind, type CapturePayload, type ClientKind } from "@/lib/freight";
import { HUNT_LANES, HUNT_RULES, huntSearchUrl } from "@/lib/hunt";
import { nowIso, phonePretty, uid } from "@/lib/format";
import { contactsToCsv, downloadText, parseContactCsv } from "@/lib/contacts";
import type { SavedSearch } from "@/lib/types";

type AiStatus = { ready?: boolean; provider?: string; ollama?: { detail?: string }; pull?: string; bookmarklet?: string };

type LastCapture = {
  leadId: string;
  name: string;
  score: number;
  confidence: string;
  why: string;
  duplicate: boolean;
  phone: string;
  suggested: Exclude<ClientKind, "Unlabeled"> | "";
};

export function DiscoverView() {
  const router = useRouter();
  const { workspace, setWorkspace, reload, loading, setSelectedLeadId } = useWorkspace();
  const [tab, setTab] = useState<"hunt" | "paste" | "csv" | "searches">("hunt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [huntQuery, setHuntQuery] = useState("forklift");
  const [huntPlace, setHuntPlace] = useState("Texas");
  const [lastCapture, setLastCapture] = useState<LastCapture | null>(null);
  const [form, setForm] = useState({
    source: "Manual",
    url: "",
    title: "",
    sellerName: "",
    sellerUrl: "",
    location: "",
    price: "",
    description: "",
    phone: "",
    email: "",
    website: "",
    notes: "",
  });
  const [searchForm, setSearchForm] = useState({ name: "", keywords: "", location: "", category: "", minFreightScore: "70" });

  const recent = useMemo(
    () => [...(workspace.listings || [])].sort((a, b) => Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt)).slice(0, 8),
    [workspace.listings],
  );

  useEffect(() => {
    fetch("/api/ai/status")
      .then((res) => res.json())
      .then((json) => setAi(json))
      .catch(() => setAi({ ready: false, provider: "rules" }));
  }, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function rememberCapture(payload: CapturePayload, json: { leadId?: string; sellerName?: string; score?: number; confidence?: string; why?: string; duplicate?: boolean; phone?: string }) {
    if (!json.leadId) return;
    setLastCapture({
      leadId: json.leadId,
      name: json.sellerName || payload.sellerName || payload.title || "Client",
      score: Number(json.score) || 0,
      confidence: String(json.confidence || "LOW"),
      why: String(json.why || ""),
      duplicate: Boolean(json.duplicate),
      phone: String(json.phone || ""),
      suggested: suggestClientKind({
        source: payload.source,
        sellerName: json.sellerName || payload.sellerName,
        title: payload.title,
        description: payload.description,
      }),
    });
  }

  async function capture(payload: CapturePayload) {
    setBusy(true);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/prospects/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, owner: workspace.settings.defaultOwner }),
      });
      const json = await res.json();
      if (res.ok && json.leadId) {
        await reload();
        rememberCapture(payload, json);
        const scored = `${json.sellerName || "Client"} · ${json.score}/100 (${json.confidence})`;
        setResult(json.duplicate ? `Already on file. ${scored}` : `Saved. ${scored}. Label them, then you send the message.`);
        if (json.skipped) setError(json.skipReason || "Model flagged this as a weak freight lead. Still saved so you can decide.");
        return json.leadId as string;
      }
      let ingested = ingestCapture(workspace, { ...payload, owner: workspace.settings.defaultOwner });
      setWorkspace((prev) => {
        ingested = ingestCapture(prev, { ...payload, owner: prev.settings.defaultOwner });
        return ingested.workspace;
      });
      rememberCapture(payload, {
        leadId: ingested.lead.id,
        sellerName: ingested.lead.name,
        score: ingested.analysis.score,
        confidence: ingested.analysis.confidence,
        why: ingested.analysis.why,
        duplicate: ingested.duplicate,
        phone: ingested.lead.phone,
      });
      setResult(
        ingested.duplicate
          ? `Already on file as ${ingested.lead.name}. Score ${ingested.analysis.score}/100.`
          : `Saved ${ingested.lead.name}. Score ${ingested.analysis.score}/100. Label them, then you send the message.`,
      );
      return ingested.lead.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save listing.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function applyLabel(leadId: string, label: ClientKind) {
    const stamp = nowIso();
    const next = label === "Unlabeled" ? "" : label;
    setWorkspace((prev) => ({
      ...prev,
      leads: prev.leads.map((item) =>
        item.id === leadId
          ? {
              ...item,
              label: next,
              nextAction: item.nextAction.startsWith("Label") ? "Send opener" : item.nextAction,
              updatedAt: stamp,
            }
          : item,
      ),
      updatedAt: stamp,
    }));
    setLastCapture((prev) => (prev && prev.leadId === leadId ? { ...prev, suggested: next && next !== "Unlabeled" ? (next as LastCapture["suggested"]) : prev.suggested } : prev));
  }

  async function onPaste(event: React.FormEvent) {
    event.preventDefault();
    const blob = [form.title, form.description, form.url, form.location].join("\n");
    if (!blob.trim()) {
      setError("Paste a title, URL, or listing details.");
      return;
    }
    if (blob.length > 8000) {
      setError("Listing text is too long. Trim it under 8,000 characters.");
      return;
    }
    const id = await capture({
      source: form.source,
      url: form.url,
      title: form.title,
      description: form.description,
      price: form.price,
      location: form.location,
      sellerName: form.sellerName,
      sellerUrl: form.sellerUrl,
      phone: form.phone,
      email: form.email,
      website: form.website,
      notes: form.notes,
      pageText: blob,
    });
    if (id) {
      setForm({ source: form.source, url: "", title: "", sellerName: "", sellerUrl: "", location: "", price: "", description: "", phone: "", email: "", website: "", notes: "" });
    }
  }

  function onImportFile(file: File) {
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseContactCsv(String(reader.result || "").slice(0, 400_000), workspace.leads);
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      let added = 0;
      setWorkspace((prev) => {
        let next = prev;
        added = 0;
        for (const row of parsed.rows) {
          if (row.duplicateOf) continue;
          const ingested = ingestCapture(next, {
            source: row.source || "CSV",
            sellerName: row.name,
            phone: row.phone,
            email: row.email,
            title: row.property || row.name,
            location: [row.city, row.state].filter(Boolean).join(", "),
            url: row.listingUrl,
            notes: row.notes,
            category: row.category,
          });
          next = ingested.workspace;
          added += ingested.duplicate ? 0 : 1;
        }
        return next;
      });
      setResult(`Imported ${added} new clients. Duplicates were merged.`);
    };
    reader.readAsText(file);
  }

  function saveSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!searchForm.name.trim()) return;
    const item: SavedSearch = {
      id: uid("ss"),
      name: searchForm.name.trim(),
      keywords: searchForm.keywords,
      source: "",
      location: searchForm.location,
      category: searchForm.category,
      minValue: null,
      minFreightScore: Number(searchForm.minFreightScore) || null,
      status: "",
      huntUrl: huntSearchUrl("machinery-trader", searchForm.keywords || "forklift", searchForm.location),
      createdAt: nowIso(),
    };
    setWorkspace((prev) => ({ ...prev, savedSearches: [item, ...(prev.savedSearches || [])], updatedAt: nowIso() }));
    setSearchForm({ name: "", keywords: "", location: "", category: "", minFreightScore: "70" });
  }

  async function copyBookmarklet() {
    if (!ai?.bookmarklet) return;
    try {
      await navigator.clipboard.writeText(ai.bookmarklet);
      setResult("Bookmarklet copied. Chrome → Bookmarks → Add → paste into URL. Open a listing, click it.");
    } catch {
      setError("Clipboard blocked. Copy the bookmarklet from Settings → AI.");
    }
  }

  const capturedLead = lastCapture ? workspace.leads.find((item) => item.id === lastCapture.leadId) : null;

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading discovery…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Discover</h1>
            <p>Open a live listing. Capture it. You label. You send. No scraping, no fake rates.</p>
          </div>
          <div className="freight-row-actions">
            <span className="az-chip">{ai?.ready ? ai.ollama?.detail || ai.provider : "Local rules · start Ollama"}</span>
            <button className="az-btn sm" type="button" onClick={() => void copyBookmarklet()}>
              Copy bookmarklet
            </button>
          </div>
        </header>

        <div className="discover-desk">
          <div className="discover-main">
            <div className="work-tabs wrap">
              {(["hunt", "paste", "csv", "searches"] as const).map((item) => (
                <button key={item} type="button" className={`az-btn sm ${tab === item ? "pri" : ""}`} onClick={() => setTab(item)}>
                  {item === "hunt" ? "Hunt" : item === "paste" ? "Paste" : item === "csv" ? "CSV" : "Saved searches"}
                </button>
              ))}
            </div>

            {error ? <p className="rec-warn">{error}</p> : null}
            {result ? <p className="rec-import-msg">{result}</p> : null}

            {tab === "hunt" ? (
              <div className="hunt-desk">
                <div className="rec-grid">
                  <label className="rec-field">
                    What to hunt
                    <input className="az-input" value={huntQuery} onChange={(event) => setHuntQuery(event.target.value)} placeholder="forklift, skid steer, CNC" />
                  </label>
                  <label className="rec-field">
                    Area
                    <input className="az-input" value={huntPlace} onChange={(event) => setHuntPlace(event.target.value)} placeholder="Texas" />
                  </label>
                </div>
                <div className="hunt-rules">
                  {HUNT_RULES.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
                <div className="hunt-lanes">
                  {HUNT_LANES.map((lane) => (
                    <article key={lane.id} className="az-panel freight-panel hunt-card">
                      <header>
                        <div>
                          <span className="az-chip">{lane.rank}</span>
                          <h3>{lane.name}</h3>
                        </div>
                        <a className="az-btn pri sm" href={huntSearchUrl(lane.id, huntQuery, huntPlace)} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      </header>
                      <p>{lane.fit}</p>
                      <p className="cd-mono">{lane.how} {lane.messageWhere}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {tab === "paste" ? (
              <form className="discover-form" onSubmit={onPaste}>
                <label className="rec-field">
                  Paste the listing
                  <textarea className="az-area" rows={7} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Paste the ad: seller, city, phone if it is on the page, equipment, dimensions…" />
                </label>
                <div className="rec-grid">
                  <label className="rec-field">
                    Source
                    <select className="az-select" value={form.source} onChange={(event) => set("source", event.target.value)}>
                      {LEAD_SOURCES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className="rec-field">
                    Listing URL
                    <input className="az-input" value={form.url} onChange={(event) => set("url", event.target.value)} placeholder="https://" />
                  </label>
                </div>
                <div className="rec-grid">
                  <label className="rec-field">
                    Seller / business
                    <input className="az-input" value={form.sellerName} onChange={(event) => set("sellerName", event.target.value)} />
                  </label>
                  <label className="rec-field">
                    City, ST
                    <input className="az-input" value={form.location} onChange={(event) => set("location", event.target.value)} placeholder="Chicago, IL" />
                  </label>
                </div>
                <div className="rec-grid">
                  <label className="rec-field">
                    Phone (only if it was on the page)
                    <input className="az-input" value={form.phone} onChange={(event) => set("phone", event.target.value)} />
                  </label>
                  <label className="rec-field">
                    Their ask (optional — not your rate)
                    <input className="az-input" value={form.price} onChange={(event) => set("price", event.target.value)} placeholder="Leave blank if unknown" />
                  </label>
                </div>
                <div className="rec-save">
                  <button className="az-btn pri" type="submit" disabled={busy}>
                    {busy ? "Scoring…" : "Save & score"}
                  </button>
                  <span className="cd-mono">{ai?.ready ? `Classifying with ${ai.provider}` : "Local rules until Ollama is up"}</span>
                </div>
              </form>
            ) : null}

            {tab === "csv" ? (
              <div className="rec-import">
                <div>
                  <b>CSV import</b>
                  <span>Headers can include name, company, phone, email, city, state, source, category, listingUrl, notes. No invented rates.</span>
                </div>
                <label className="az-btn pri sm rec-file">
                  Choose file
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onImportFile(file);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : null}

            {tab === "searches" ? (
              <div className="discover-searches">
                <form className="discover-form" onSubmit={saveSearch}>
                  <div className="rec-grid">
                    <label className="rec-field">
                      Search name
                      <input className="az-input" value={searchForm.name} onChange={(event) => setSearchForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Heavy Equipment – Texas" />
                    </label>
                    <label className="rec-field">
                      Keywords
                      <input className="az-input" value={searchForm.keywords} onChange={(event) => setSearchForm((prev) => ({ ...prev, keywords: event.target.value }))} />
                    </label>
                  </div>
                  <div className="rec-grid">
                    <label className="rec-field">
                      Location
                      <input className="az-input" value={searchForm.location} onChange={(event) => setSearchForm((prev) => ({ ...prev, location: event.target.value }))} placeholder="TX" />
                    </label>
                    <label className="rec-field">
                      Min score
                      <input className="az-input" value={searchForm.minFreightScore} onChange={(event) => setSearchForm((prev) => ({ ...prev, minFreightScore: event.target.value }))} />
                    </label>
                  </div>
                  <button className="az-btn pri sm" type="submit">
                    Save search
                  </button>
                </form>
                {(workspace.savedSearches || []).length === 0 ? <p className="rec-empty">No saved searches yet.</p> : null}
                {(workspace.savedSearches || []).map((item) => (
                  <div key={item.id} className="work-row">
                    <div>
                      <b>{item.name}</b>
                      <div className="cd-mono">
                        {[item.keywords, item.location, item.minFreightScore != null ? `score ≥ ${item.minFreightScore}` : ""].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <a className="az-btn sm" href={item.huntUrl || huntSearchUrl("machinery-trader", item.keywords, item.location)} target="_blank" rel="noreferrer">
                      Hunt
                    </a>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="discover-rail">
            <section className="az-panel freight-panel">
              <header>
                <h3>Just captured</h3>
              </header>
              {lastCapture ? (
                <>
                  <b>{lastCapture.name}</b>
                  <p className="cd-mono">
                    Screen {lastCapture.score}/100 · {lastCapture.confidence}
                    {lastCapture.phone ? ` · ${phonePretty(lastCapture.phone)}` : " · no phone on the page"}
                    {lastCapture.duplicate ? " · already on file" : ""}
                  </p>
                  {lastCapture.why ? <p>{lastCapture.why}</p> : null}
                  <p className="cd-mono">Label — you decide. Suggested: {lastCapture.suggested || "none"}</p>
                  <div className="label-chips">
                    {CLIENT_KINDS.filter((kind) => kind !== "Unlabeled").map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className={`az-btn sm ${capturedLead?.label === kind ? "pri" : ""}`}
                        onClick={() => applyLabel(lastCapture.leadId, kind)}
                      >
                        {kind}
                      </button>
                    ))}
                  </div>
                  <div className="freight-row-actions" style={{ marginTop: 10 }}>
                    <button
                      className="az-btn pri sm"
                      type="button"
                      onClick={() => {
                        setSelectedLeadId(lastCapture.leadId);
                        router.push("/outreach");
                      }}
                    >
                      Work outreach
                    </button>
                    <button className="az-btn sm" type="button" onClick={() => router.push(`/people?id=${lastCapture.leadId}`)}>
                      Open client
                    </button>
                  </div>
                </>
              ) : (
                <p className="rec-empty">Hunt, then paste or click the bookmarklet. The scored client lands here so you can label them.</p>
              )}
            </section>

            <section className="az-panel freight-panel">
              <header>
                <h3>On file</h3>
                <button className="az-btn sm" type="button" onClick={() => downloadText("lumen-clients.csv", contactsToCsv(workspace.leads))}>
                  CSV
                </button>
              </header>
              {recent.length === 0 ? <p className="rec-empty">Nothing captured yet.</p> : null}
              {recent.map((item) => {
                const lead = workspace.leads.find((row) => row.id === item.leadId);
                return (
                  <button key={item.id} type="button" className="work-row text-left" onClick={() => router.push(`/people?id=${item.leadId}`)}>
                    <div>
                      <b>{lead?.name || item.sellerName || item.title}</b>
                      <div className="cd-mono">
                        {lead?.label || "Unlabeled"} · {item.source}
                      </div>
                    </div>
                    <span className="freight-score">
                      <b>{lead?.freightScore ?? "—"}</b>
                    </span>
                  </button>
                );
              })}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

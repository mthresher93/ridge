"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { CLIENT_KINDS, LEAD_SOURCES, captureFacts, extractListingData, ingestCapture, suggestClientKind, type CapturePayload, type ClientKind } from "@/lib/freight";
import { workPath } from "@/lib/nav";
import { todayHunt } from "@/lib/desk";
import { HUNT_CONNECTIONS, HUNT_PLAYS, HUNT_PRESETS, HUNT_RULES, HUNT_STEPS, huntLane, huntPack, huntPackText, huntSearchUrl, sourceFromLane, type HuntPackItem, type HuntRank } from "@/lib/hunt";
import { densestHuntPlace, leadsInPlace, METROS } from "@/lib/metro";
import { firstCall } from "@/lib/prospect";
import { isCallablePhone } from "@/lib/carriers";
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
  const searchParams = useSearchParams();
  const { workspace, setWorkspace, reload, loading, setSelectedLeadId } = useWorkspace();
  const [tab, setTab] = useState<"hunt" | "paste" | "csv" | "searches" | "logins">("hunt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [ai, setAi] = useState<AiStatus | null>(null);
  const dayHunt = useMemo(() => todayHunt(new Date(), workspace), [workspace]);
  const [huntQuery, setHuntQuery] = useState(searchParams.get("q") || dayHunt.query);
  const [huntPlace, setHuntPlace] = useState(searchParams.get("place") || "");
  const activePlace = huntPlace || densestHuntPlace(workspace) || dayHunt.place;
  const [playFilter, setPlayFilter] = useState(searchParams.get("play") || dayHunt.play.id);
  const [blockedPack, setBlockedPack] = useState<HuntPackItem[]>([]);
  const [lastCapture, setLastCapture] = useState<LastCapture | null>(null);
  const [lastLane, setLastLane] = useState<{ id: string; name: string } | null>(null);
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

  useEffect(() => {
    const q = searchParams.get("q");
    const place = searchParams.get("place");
    const play = searchParams.get("play");
    const nextTab = searchParams.get("tab");
    if (q) setHuntQuery(q);
    if (place) setHuntPlace(place);
    if (play && HUNT_PLAYS.some((item) => item.id === play)) setPlayFilter(play);
    if (nextTab === "paste" || nextTab === "csv" || nextTab === "searches" || nextTab === "logins" || nextTab === "hunt") {
      setTab(nextTab);
    }
  }, [searchParams]);

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

  async function onPaste(event: React.FormEvent, andWork = false) {
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
    const pulledListing = extractListingData({
      source: form.source,
      url: form.url,
      title: form.title,
      description: form.description,
      location: form.location,
      sellerName: form.sellerName,
      phone: form.phone,
      price: form.price,
      pageText: blob,
    });
    const id = await capture({
      source: form.source,
      url: form.url,
      title: form.title || pulledListing.title,
      description: form.description,
      price: form.price || (pulledListing.askingPrice != null ? String(pulledListing.askingPrice) : ""),
      location: form.location || [pulledListing.city, pulledListing.state].filter(Boolean).join(", "),
      sellerName: form.sellerName || pulledListing.sellerName,
      sellerUrl: form.sellerUrl,
      phone: form.phone || pulledListing.phone,
      email: form.email || pulledListing.email,
      website: form.website || pulledListing.website,
      notes: form.notes,
      dimensions: pulledListing.dimensions,
      weight: pulledListing.weight,
      pageText: blob,
    });
    if (id) {
      setForm({ source: form.source, url: "", title: "", sellerName: "", sellerUrl: "", location: "", price: "", description: "", phone: "", email: "", website: "", notes: "" });
      setSelectedLeadId(id);
      if (andWork) router.push(workPath(id));
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

  function markOpened(laneId: string) {
    const lane = huntLane(laneId);
    setLastLane({ id: laneId, name: lane?.name || laneId });
    setForm((prev) => ({ ...prev, source: sourceFromLane(laneId) }));
  }

  function openFirstSearch() {
    const pack = huntPack(huntQuery, activePlace, playFilter);
    const first = pack[0];
    if (!first) return;
    markOpened(first.id);
    window.open(first.url, "_blank", "noopener,noreferrer");
    setBlockedPack([]);
    setResult(`Opened ${first.name}. Copy a dealer or listing with a published phone, then paste.`);
  }

  function saveCurrentHunt() {
    const play = HUNT_PLAYS.find((item) => item.id === playFilter) || HUNT_PLAYS[0];
    const item: SavedSearch = {
      id: uid("ss"),
      name: [huntQuery, activePlace, play?.title].filter(Boolean).join(" · "),
      keywords: huntQuery,
      source: play?.id || "",
      location: activePlace,
      category: play?.title || "",
      minValue: null,
      minFreightScore: 70,
      status: "",
      huntUrl: huntPack(huntQuery, activePlace, playFilter)[0]?.url || huntSearchUrl("maps-dealers", huntQuery, activePlace),
      createdAt: nowIso(),
    };
    setWorkspace((prev) => ({ ...prev, savedSearches: [item, ...(prev.savedSearches || [])], updatedAt: nowIso() }));
    setResult(`Saved hunt: ${item.name}. Open it from Saved searches.`);
  }

  function openTopPack() {
    setError("");
    const pack = huntPack(huntQuery, activePlace, playFilter);
    const blocked: HuntPackItem[] = [];
    for (const item of pack) {
      markOpened(item.id);
      const win = window.open(item.url, `_haul_${item.id}`);
      if (!win) blocked.push(item);
    }
    setBlockedPack(blocked);
    if (blocked.length) {
      setResult(`Opened ${pack.length - blocked.length} searches. Browser blocked the rest — click Open on those, then paste.`);
    } else {
      setResult(`Opened ${pack.length} public searches. Copy a yard with a name and a phone, then paste.`);
    }
  }

  async function copyHuntLinks() {
    setError("");
    try {
      await navigator.clipboard.writeText(huntPackText(huntQuery, activePlace, playFilter));
      setResult("Hunt links copied. Paste them into a note or open them yourself.");
    } catch {
      setError("Clipboard blocked.");
    }
  }

  function rankChip(rank: HuntRank) {
    if (rank === "Best") return "az-chip gold";
    if (rank === "Volume" || rank === "Spot") return "az-chip warn";
    return "az-chip";
  }

  const activePlay = HUNT_PLAYS.find((item) => item.id === playFilter) || HUNT_PLAYS[0];
  const pack = huntPack(huntQuery, activePlace, activePlay.id);
  const nearby = useMemo(
    () =>
      leadsInPlace(workspace.leads, activePlace)
        .filter((lead) => isCallablePhone(lead.phone) || lead.phone)
        .slice(0, 8),
    [workspace.leads, activePlace],
  );
  const capturedToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t = start.getTime();
    return (workspace.listings || []).filter((item) => Date.parse(item.discoveredAt) >= t).length;
  }, [workspace.listings]);
  const capturedLead = lastCapture ? workspace.leads.find((item) => item.id === lastCapture.leadId) : null;
  const pastePreview = useMemo(
    () =>
      extractListingData({
        source: form.source,
        url: form.url,
        title: form.title,
        description: form.description,
        location: form.location,
        sellerName: form.sellerName,
        phone: form.phone,
        price: form.price,
        pageText: form.description,
      }),
    [form],
  );
  const pulled = captureFacts(pastePreview);

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading discovery…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Discover</h1>
            <p>Stay in one metro. Open a public search. Paste the page. The next yard stays on this screen.</p>
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
              {(["hunt", "paste", "csv", "searches", "logins"] as const).map((item) => (
                <button key={item} type="button" className={`az-btn sm ${tab === item ? "pri" : ""}`} onClick={() => setTab(item)}>
                  {item === "hunt" ? "Hunt" : item === "paste" ? "Paste" : item === "csv" ? "CSV" : item === "searches" ? "Saved searches" : "What you need"}
                </button>
              ))}
            </div>

            {error ? <p className="rec-warn">{error}</p> : null}
            {result ? <p className="rec-import-msg">{result}</p> : null}

            {tab === "hunt" ? (
              <div className="hunt-desk">
                <section className="hunt-command">
                  <div className="home-kicker">
                    {activePlay.id === dayHunt.play.id ? `${dayHunt.weekday} hunt` : "This hunt"}
                  </div>
                  <h2>{activePlay.title}</h2>
                  <p>{activePlay.why}</p>
                  <p className="cd-mono">{activePlay.talkTo}</p>
                  <div className="rec-grid hunt-command-fields">
                    <label className="rec-field">
                      What to hunt
                      <input className="az-input" value={huntQuery} onChange={(event) => setHuntQuery(event.target.value)} placeholder="forklift, skid steer, CNC" />
                    </label>
                    <label className="rec-field">
                      Area
                      <input className="az-input" value={activePlace} onChange={(event) => setHuntPlace(event.target.value)} placeholder="Dallas TX" />
                    </label>
                  </div>
                  <div className="metro-chips">
                    {METROS.map((metro) => (
                      <button
                        key={metro.id}
                        type="button"
                        className={`az-btn sm ${activePlace === metro.hunt ? "pri" : ""}`}
                        onClick={() => setHuntPlace(metro.hunt)}
                      >
                        {metro.label}
                      </button>
                    ))}
                  </div>
                  <div className="hunt-presets">
                    {HUNT_PRESETS.map((preset) => (
                      <button
                        key={`${preset.query}-${preset.place}`}
                        type="button"
                        className={`az-btn sm ${huntQuery === preset.query && activePlace === preset.place ? "pri" : ""}`}
                        onClick={() => {
                          setHuntQuery(preset.query);
                          setHuntPlace(preset.place);
                        }}
                      >
                        {preset.query} · {preset.place}
                      </button>
                    ))}
                  </div>
                  <div className="hunt-actions">
                    <button className="az-btn pri" type="button" onClick={openFirstSearch}>
                      Open {pack[0]?.name || "first search"}
                    </button>
                    <button className="az-btn" type="button" onClick={() => document.getElementById("hunt-paste")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                      Paste a page
                    </button>
                    <button className="az-btn sm" type="button" onClick={openTopPack}>
                      Open top {pack.length}
                    </button>
                    <button className="az-btn sm" type="button" onClick={() => void copyHuntLinks()}>
                      Copy links
                    </button>
                    <button className="az-btn sm" type="button" onClick={saveCurrentHunt}>
                      Save this hunt
                    </button>
                  </div>
                </section>

                <ol className="hunt-ritual">
                  {HUNT_STEPS.map((item, index) => (
                    <li key={item}>
                      <b>{index + 1}</b>
                      <p>{item}</p>
                    </li>
                  ))}
                </ol>

                <div className="hunt-play-grid">
                  {HUNT_PLAYS.map((play) => (
                    <button
                      key={play.id}
                      type="button"
                      className={`hunt-play-pick ${activePlay.id === play.id ? "on" : ""}`}
                      onClick={() => setPlayFilter(play.id)}
                    >
                      <span className={rankChip(play.rank)}>{play.rank}</span>
                      <b>{play.title}</b>
                      <p>{play.why}</p>
                    </button>
                  ))}
                </div>

                {lastLane ? (
                  <div className="hunt-next">
                    <p>
                      You opened <b>{lastLane.name}</b>. Copy the dealer or listing, then paste below. Phone only if it was published.
                    </p>
                    <button className="az-btn pri sm" type="button" onClick={() => document.getElementById("hunt-paste")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                      Paste it
                    </button>
                  </div>
                ) : null}
                {blockedPack.length ? (
                  <div className="hunt-blocked">
                    <p>Browser blocked these. Open them one at a time:</p>
                    {blockedPack.map((item) => (
                      <a key={item.id} className="az-btn sm" href={item.url} target="_blank" rel="noreferrer">
                        {item.name}
                      </a>
                    ))}
                  </div>
                ) : null}

                <section className="hunt-lanes">
                  <header>
                    <div>
                      <div className="home-kicker">Where to open</div>
                      <h3>{activePlay.title} · {huntQuery} in {activePlace}</h3>
                    </div>
                    <span className="cd-mono">{activePlay.laneIds.length} public searches · you open them</span>
                  </header>
                  <div className="hunt-lane-grid">
                    {activePlay.laneIds.map((laneId) => {
                      const lane = huntLane(laneId);
                      if (!lane) return null;
                      return (
                        <article key={lane.id} className="hunt-lane-card">
                          <header>
                            <div>
                              <span className={rankChip(lane.rank)}>{lane.rank}</span>
                              <h3>{lane.name}</h3>
                            </div>
                            <a className="az-btn pri sm" href={huntSearchUrl(lane.id, huntQuery, activePlace)} target="_blank" rel="noreferrer" onClick={() => markOpened(lane.id)}>
                              Open
                            </a>
                          </header>
                          <p>{lane.fit}</p>
                          <p className="cd-mono">{lane.how}</p>
                          <p className="hunt-lane-legal">{lane.legal}</p>
                        </article>
                      );
                    })}
                  </div>
                </section>

                {nearby.length ? (
                  <section className="az-panel freight-panel nearby-file">
                    <header>
                      <div>
                        <div className="home-kicker">Already on file</div>
                        <h3>{nearby.length} in {activePlace}</h3>
                      </div>
                    </header>
                    <p className="cd-mono">Skip recapturing these. Call them from Desk if they are still uncontacted.</p>
                    {nearby.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        className="work-row text-left"
                        onClick={() => {
                          setSelectedLeadId(lead.id);
                          router.push(workPath(lead.id));
                        }}
                      >
                        <div>
                          <b>{lead.name}</b>
                          <div className="cd-mono">
                            {lead.label || "Unlabeled"} · {lead.phone ? phonePretty(lead.phone) : "no phone"} · {lead.status}
                          </div>
                        </div>
                        <span className="freight-score">
                          <b>{lead.freightScore ?? "—"}</b>
                        </span>
                      </button>
                    ))}
                  </section>
                ) : null}

                <form id="hunt-paste" className="az-panel freight-panel hunt-paste" onSubmit={(event) => void onPaste(event, false)}>
                  <div className="home-kicker">{lastLane ? `Paste from ${lastLane.name}` : "Then capture"}</div>
                  <h3>Paste the page you copied</h3>
                  <p>Move' pulls name, published phone, and city. Leave the phone blank if it was not on the page.</p>
                  <label className="rec-field">
                    Listing or Maps card
                    <textarea className="az-area" rows={7} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder={lastLane ? `Paste the ${lastLane.name} page.` : "Paste the whole dealer or listing page."} />
                  </label>
                  {form.description.trim() ? (
                    <div className="paste-preview">
                      {pulled.length ? (
                        pulled.map((item) => (
                          <span key={item.k}>
                            <b>{item.k}</b> {item.v}
                          </span>
                        ))
                      ) : (
                        <span>Nothing parsed yet — a name, city, or dims help.</span>
                      )}
                      {!pastePreview.phone ? <span>No phone on the page — that&apos;s fine.</span> : null}
                    </div>
                  ) : null}
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
                  <div className="rec-save">
                    <button className="az-btn pri" type="submit" disabled={busy}>
                      {busy ? "Saving…" : "Save — keep hunting"}
                    </button>
                    <button className="az-btn" type="button" disabled={busy} onClick={(event) => void onPaste(event, true)}>
                      Save and work this
                    </button>
                    <span className="cd-mono">Stays on this hunt so you can paste the next yard.</span>
                  </div>
                </form>
                <p className="hunt-fine">{HUNT_RULES[0]}</p>
              </div>
            ) : null}

            {tab === "paste" ? (
              <form className="az-panel freight-panel paste-stage" onSubmit={(event) => void onPaste(event, true)}>
                <div className="home-kicker">Capture</div>
                <h2>Paste the listing</h2>
                <p>Copy a dealer card or listing you already opened. Move' only keeps facts that were on the page.</p>
                <label className="rec-field">
                  Paste the listing
                  <textarea className="az-area" rows={8} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder={lastLane ? `Paste the ${lastLane.name} page. Move' pulls name, published phone, city.` : "Paste the whole dealer or listing page. Move' pulls name, published phone, city, dims, and weight."} />
                </label>
                {form.description.trim() ? (
                  <div className="paste-preview">
                    {pulled.length ? (
                      pulled.map((item) => (
                        <span key={item.k}>
                          <b>{item.k}</b> {item.v}
                        </span>
                      ))
                    ) : (
                      <span>Nothing parsed yet — a name, city, or dims help.</span>
                    )}
                    {!pastePreview.phone ? <span>No phone on the page — that's fine.</span> : null}
                  </div>
                ) : null}
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
                    <input className="az-input" value={form.sellerName} onChange={(event) => set("sellerName", event.target.value)} placeholder={pastePreview.sellerName || "Pulled from the paste if you leave this blank"} />
                  </label>
                  <label className="rec-field">
                    City, ST
                    <input className="az-input" value={form.location} onChange={(event) => set("location", event.target.value)} placeholder={pastePreview.city ? [pastePreview.city, pastePreview.state].filter(Boolean).join(", ") : "Chicago, IL"} />
                  </label>
                </div>
                <div className="rec-grid">
                  <label className="rec-field">
                    Phone (only if it was on the page)
                    <input className="az-input" value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder={pastePreview.phone || "Leave blank if it wasn't published"} />
                  </label>
                  <label className="rec-field">
                    Their ask (optional — not your rate)
                    <input className="az-input" value={form.price} onChange={(event) => set("price", event.target.value)} placeholder="Leave blank if unknown" />
                  </label>
                </div>
                <div className="rec-save">
                  <button className="az-btn pri" type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save and work this"}
                  </button>
                  <span className="cd-mono">{ai?.ready ? `Classifying with ${ai.provider}` : "Local rules until Ollama is up"}</span>
                </div>
              </form>
            ) : null}

            {tab === "csv" ? (
              <div className="az-panel freight-panel rec-import">
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
              <div className="az-panel freight-panel discover-searches">
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

            {tab === "logins" ? (
              <div className="az-panel freight-panel hunt-desk">
                <div className="st-ledger">
                  {HUNT_CONNECTIONS.map((item) => (
                    <div key={item.name} className="st-ledger-row">
                      <div>
                        <b>{item.name}</b>
                        <span>{item.detail}</span>
                      </div>
                      <em className={item.value === "None" || item.value === "Browser" ? "ok" : ""}>{item.value}</em>
                    </div>
                  ))}
                </div>
                <p className="st-fine">
                  Machinery Trader, Google, Cat/Toyota/Bobcat/Deere locators, Sunbelt, United, TruckPaper, Copart, IAA, Ritchie — those are websites you already open. Paste or bookmarklet on a page you are allowed to view. Move' never stores a Facebook or DAT token.
                </p>
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
                  {capturedLead ? <blockquote className="desk-opener">{firstCall(capturedLead).opener}</blockquote> : null}
                  <p className="cd-mono">Label here, then call. Suggested: {lastCapture.suggested || "none"}</p>
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
                    {lastCapture.phone ? (
                      <a className="az-btn pri sm" href={`tel:${lastCapture.phone}`}>
                        Call {phonePretty(lastCapture.phone)}
                      </a>
                    ) : null}
                    {capturedLead ? (
                      <button
                        className="az-btn sm"
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(firstCall(capturedLead).opener);
                            setResult("Opener copied. You send it.");
                          } catch {
                            setError("Clipboard blocked. Select the opener on Work.");
                          }
                        }}
                      >
                        Copy opener
                      </button>
                    ) : null}
                    <button
                      className="az-btn sm"
                      type="button"
                      onClick={() => {
                        setSelectedLeadId(lastCapture.leadId);
                        router.push(workPath(lastCapture.leadId));
                      }}
                    >
                      Work this
                    </button>
                  </div>
                </>
              ) : (
                <p className="rec-empty">Open a hunt, copy a page with a name and a published phone, paste it. The scored client lands here so you can label them.</p>
              )}
              <p className="cd-mono" style={{ marginTop: 10 }}>
                {capturedToday} captured today · paste after you open a search
              </p>
            </section>

            <section className="az-panel freight-panel">
              <header>
                <h3>On file</h3>
                <button className="az-btn sm" type="button" onClick={() => downloadText("move-clients.csv", contactsToCsv(workspace.leads))}>
                  CSV
                </button>
              </header>
              {recent.length === 0 ? <p className="rec-empty">Nothing captured yet.</p> : null}
              {recent.map((item) => {
                const lead = workspace.leads.find((row) => row.id === item.leadId);
                return (
                  <button key={item.id} type="button" className="work-row text-left" onClick={() => { setSelectedLeadId(item.leadId); router.push(workPath(item.leadId)); }}>
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

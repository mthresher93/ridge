"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { CLIENT_KINDS, LEAD_SOURCES, captureFacts, extractListingData, ingestCapture, suggestClientKind, type CapturePayload, type ClientKind } from "@/lib/freight";
import { workPath } from "@/lib/nav";
import { todayHunt } from "@/lib/desk";
import { HUNT_PLAYS, huntLane, huntPack, huntPackText, huntSearchUrl, sourceFromLane, type HuntPackItem, type HuntRank } from "@/lib/hunt";
import type { SavedSearch } from "@/lib/types";
import { bookCensus } from "@/lib/book";
import { densestHuntPlace, leadsInPlace, METROS } from "@/lib/metro";
import { firstCall } from "@/lib/prospect";
import { isCallablePhone } from "@/lib/carriers";
import { cityQueries, clientSaveError, DESK_CITIES, DESK_LOCATORS, googleHuntUrl, osmHuntUrl } from "@/lib/desk-rules";
import { nowIso, phonePretty, uid } from "@/lib/format";
import { contactsToCsv, downloadText, parseContactCsv } from "@/lib/contacts";
import type { FinderHit } from "@/lib/finder";

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
  const [tab, setTab] = useState<"hunt" | "finder" | "paste" | "csv" | "searches" | "logins">("hunt");
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
  const [finderHits, setFinderHits] = useState<FinderHit[]>([]);
  const [finderNote, setFinderNote] = useState("");
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
    if (nextTab === "paste" || nextTab === "csv" || nextTab === "searches" || nextTab === "logins" || nextTab === "hunt" || nextTab === "finder") {
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

  async function runFinder() {
    setBusy(true);
    setError("");
    setResult("");
    try {
      const res = await fetch(`/api/finder?q=${encodeURIComponent(huntQuery)}&place=${encodeURIComponent(activePlace)}`);
      const json = (await res.json()) as { ok?: boolean; error?: string; hits?: FinderHit[]; note?: string };
      if (!res.ok) {
        setError(json.error || "Customer finder failed.");
        setFinderHits([]);
        return;
      }
      setFinderHits(json.hits || []);
      setFinderNote(json.note || "");
      setResult(json.hits?.length ? `${json.hits.length} OSM hits in ${activePlace}.` : json.note || "No OSM hits.");
    } catch {
      setError("Customer finder could not reach the API.");
    } finally {
      setBusy(false);
    }
  }

  function saveFinderHit(hit: FinderHit) {
    const already = workspace.leads.some(
      (lead) => !lead.archivedAt && lead.name.trim().toLowerCase() === hit.name.trim().toLowerCase() && (lead.city || "").toLowerCase() === (hit.city || "").toLowerCase(),
    );
    if (already) {
      setResult(`${hit.name} is already on file.`);
      return;
    }
    void capture({
      source: "OpenStreetMap",
      sellerName: hit.name,
      phone: hit.phone,
      website: hit.website,
      location: [hit.street, hit.city, hit.state].filter(Boolean).join(", "),
      url: hit.osmUrl,
      title: hit.name,
      notes: hit.phone ? "OSM tagged a phone. Confirm on their site before you treat it as gospel." : "OSM had no phone. Open their site or Maps page and paste if you find a published number.",
    });
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
    setLastCapture((prev) => (prev && prev.leadId === leadId ? { ...prev, suggested: next ? (next as LastCapture["suggested"]) : prev.suggested } : prev));
  }

  async function onPaste(event: React.FormEvent, andWork = false) {
    event.preventDefault();
    const blob = [form.title, form.description, form.url, form.location].join("\n");
    if (!blob.trim()) {
      setError("Paste the page you opened.");
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
    const blocked = clientSaveError({
      name: form.sellerName || pulledListing.sellerName || pulledListing.title,
      city: pulledListing.city,
      state: pulledListing.state,
      phone: form.phone || pulledListing.phone,
      location: form.location || [pulledListing.city, pulledListing.state].filter(Boolean).join(", "),
    });
    if (blocked) {
      setError(blocked);
      return;
    }
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
    if (rank === "Best") return "az-chip best";
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
  const census = useMemo(() => bookCensus(workspace.leads), [workspace.leads]);
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
            <p>One metro. Open a public page. Paste a published phone.</p>
          </div>
        </header>

        <div className="discover-desk">
          <div className="discover-main">
            {error ? <p className="rec-warn">{error}</p> : null}
            {result ? <p className="rec-import-msg">{result}</p> : null}

            <div className="hunt-desk desk-hunt capture-sheet">
              <section className="hunt-step capture-top">
                <div className="home-kicker">City</div>
                <div className="metro-chips">
                  {DESK_CITIES.map((metro) => (
                    <button
                      key={metro.id}
                      type="button"
                      className={`az-btn sm ${activePlace === metro.hunt ? "pri" : ""}`}
                      onClick={() => {
                        setHuntPlace(metro.hunt);
                        setHuntQuery(cityQueries(metro.label)[0]);
                      }}
                    >
                      {metro.label}
                    </button>
                  ))}
                </div>
              </section>
              <section className="hunt-step">
                <div className="home-kicker">Query</div>
                <input className="az-input" value={huntQuery} onChange={(event) => setHuntQuery(event.target.value)} placeholder="forklift dealer Houston TX" />
                <div className="metro-chips">
                  {cityQueries((DESK_CITIES.find((item) => item.hunt === activePlace) || DESK_CITIES[2]).label).map((item) => (
                    <button key={item} type="button" className={`az-btn sm ${huntQuery === item ? "pri" : ""}`} onClick={() => setHuntQuery(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </section>
              <section className="hunt-step">
                <div className="home-kicker">Open</div>
                <div className="hunt-open-row">
                  <a className="az-btn pri" href={googleHuntUrl(huntQuery)} target="_blank" rel="noreferrer">Open Google top results</a>
                  <a className="az-btn" href={DESK_LOCATORS[0].url(activePlace)} target="_blank" rel="noreferrer">Open dealer locators</a>
                  <a className="az-btn" href={osmHuntUrl(huntQuery, activePlace)} target="_blank" rel="noreferrer">Open OSM yards</a>
                </div>
                <div className="locator-links">
                  {DESK_LOCATORS.map((item) => (
                    <a key={item.name} className="az-btn sm" href={item.url(activePlace)} target="_blank" rel="noreferrer">
                      {item.name}
                    </a>
                  ))}
                </div>
              </section>
              <form id="hunt-paste" className="az-panel freight-panel hunt-paste capture-paste" onSubmit={(event) => void onPaste(event, false)}>
                <div className="home-kicker">Paste</div>
                <h3>Published phone on the page</h3>
                <p>Name, Texas city, 10-digit number. No phone → do not save.</p>
                <label className="rec-field">
                  Listing or Maps card
                  <textarea className="az-area" rows={11} value={form.description} onChange={(event) => set("description", event.target.value)} placeholder="Paste the dealer or Maps page." />
                </label>
                {form.description.trim() ? (
                  <div className="paste-preview">
                    {pulled.length ? pulled.map((item) => (
                      <span key={item.k}><b>{item.k}</b> {item.v}</span>
                    )) : <span>Need a name, city, and published phone.</span>}
                    {!pastePreview.phone ? <span className="rec-warn">No published phone — will not save.</span> : null}
                  </div>
                ) : null}
                <div className="rec-save">
                  <button className="az-btn pri" type="submit" disabled={busy}>{busy ? "Saving…" : "Save — keep hunting"}</button>
                  <button className="az-btn" type="button" disabled={busy} onClick={(event) => void onPaste(event, true)}>Save and call</button>
                </div>
              </form>
            </div>
          </div>

          <aside className="discover-rail">
            <section className="az-panel freight-panel">
              <header>
                <h3>Today’s captures</h3>
              </header>
              {lastCapture ? (
                <>
                  <b>{lastCapture.name}</b>
                  <p className="cd-mono">
                    {lastCapture.phone ? phonePretty(lastCapture.phone) : "no phone"}
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
                <p className="rec-empty">Paste a page with a published phone. Label it here, then call.</p>
              )}
              <p className="cd-mono" style={{ marginTop: 10 }}>
                {capturedToday} captured today
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

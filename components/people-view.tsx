"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { nowIso, phonePretty } from "@/lib/format";
import { contactsToCsv, downloadText, parseContactCsv, type ImportDraft } from "@/lib/contacts";
import { LeadDrawer } from "./lead-drawer";
import { companyName, ingestCapture, leadLocation, matchesProspectFilter, type ProspectFilter } from "@/lib/freight";
import { groupByMetro, metroOf } from "@/lib/metro";
import { labelObviousYards, obviousYardCount } from "@/lib/prospect";

const FILTERS: { id: ProspectFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unlabeled", label: "Unlabeled" },
  { id: "uncontacted", label: "Uncontacted" },
  { id: "talking", label: "Talking" },
  { id: "quote", label: "Quote" },
  { id: "recurring", label: "Recurring" },
];

export function PeopleView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace, setWorkspace, log, loading, setSelectedLeadId } = useWorkspace();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [filter, setFilter] = useState<ProspectFilter>(() => {
    const fromUrl = searchParams.get("filter");
    return FILTERS.some((item) => item.id === fromUrl) ? (fromUrl as ProspectFilter) : "all";
  });
  const [shelf, setShelf] = useState<"live" | "archived">("live");
  const [importRows, setImportRows] = useState<ImportDraft[] | null>(null);
  const [importError, setImportError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", phone: "", city: "", state: "" });
  const [addError, setAddError] = useState("");
  const [metroId, setMetroId] = useState("all");
  const obvious = useMemo(() => obviousYardCount(workspace.leads), [workspace.leads]);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setSelectedId(id);
    const q = searchParams.get("q");
    if (q) setQuery(q);
    const fromUrl = searchParams.get("filter");
    if (fromUrl && FILTERS.some((item) => item.id === fromUrl)) setFilter(fromUrl as ProspectFilter);
  }, [searchParams]);

  const leads = useMemo(() => {
    return workspace.leads.filter((lead) => {
      const archived = Boolean(lead.archivedAt);
      if (shelf === "live" ? archived : !archived) return false;
      if (!matchesProspectFilter(lead, filter)) return false;
      if (metroId !== "all" && metroOf(lead)?.id !== metroId) return false;
      const hay = [lead.name, companyName(lead), lead.label, lead.city, lead.state, lead.phone, lead.email, lead.owner, lead.source, lead.category, lead.equipmentType, lead.listingTitle].join(" ").toLowerCase();
      return !query || hay.includes(query.toLowerCase());
    });
  }, [workspace.leads, query, filter, shelf, metroId]);

  const selected = workspace.leads.find((lead) => lead.id === selectedId) || null;

  function addLead(event: React.FormEvent) {
    event.preventDefault();
    const name = addForm.name.trim();
    if (!name) {
      setAddError("Name is required. Use a real seller or company from the listing.");
      return;
    }
    let savedId = "";
    setWorkspace((prev) => {
      const result = ingestCapture(prev, {
        source: "Manual",
        sellerName: name,
        phone: addForm.phone.trim(),
        location: [addForm.city.trim(), addForm.state.trim()].filter(Boolean).join(", "),
        title: name,
      });
      savedId = result.lead.id;
      return result.workspace;
    });
    log("lead", savedId, "created", "Client added from typed facts");
    setSelectedId(savedId);
    setSelectedLeadId(savedId);
    setAdding(false);
    setAddForm({ name: "", phone: "", city: "", state: "" });
    setAddError("");
  }

  function exportCsv() {
    downloadText(`move-clients-${shelf}.csv`, contactsToCsv(leads));
  }

  function onImportFile(file: File) {
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseContactCsv(String(reader.result || ""), workspace.leads);
      if (parsed.error) {
        setImportRows(null);
        setImportError(parsed.error);
        return;
      }
      setImportRows(parsed.rows);
    };
    reader.readAsText(file);
  }

  function commitImport() {
    if (!importRows?.length) return;
    setWorkspace((prev) => {
      let next = prev;
      for (const row of importRows) {
        if (row.duplicateOf) continue;
        next = ingestCapture(next, {
          source: row.source || "CSV",
          sellerName: row.name,
          phone: row.phone,
          email: row.email,
          title: row.property || row.name,
          location: [row.city, row.state].filter(Boolean).join(", "),
          url: row.listingUrl,
          notes: row.notes,
          category: row.category,
        }).workspace;
      }
      return next;
    });
    log("lead", "import", "csv_import", "Imported clients from CSV");
    setImportRows(null);
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading clients…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Clients</h1>
            <p>
              {leads.length} {shelf} · typed name, published phone, city. Hunt a listing when you can paste the page.
            </p>
          </div>
          <div className="rec-head-actions">
            <button className="az-btn sm" type="button" onClick={() => router.push("/discover?tab=paste")}>
              Paste a listing
            </button>
            <button className="az-btn sm" type="button" onClick={exportCsv}>
              Export CSV
            </button>
            <label className="az-btn sm rec-file">
              Import CSV
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
            {obvious ? (
              <button
                className="az-btn pri sm"
                type="button"
                onClick={() => {
                  const stamp = nowIso();
                  setWorkspace((prev) => ({ ...prev, leads: labelObviousYards(prev.leads, stamp), updatedAt: stamp }));
                  log("lead", "book", "labeled", "Labeled obvious yards from Clients");
                }}
              >
                Label {obvious} obvious yards
              </button>
            ) : null}
            <button className="az-btn pri sm" type="button" onClick={() => setAdding(true)}>
              Add client
            </button>
          </div>
        </header>

        <div className="crm-desk-tools">
          <input className="az-input" placeholder="Search name, label, city, source" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="work-tabs wrap">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" className={`az-btn sm ${filter === item.id ? "pri" : ""}`} onClick={() => setFilter(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="metro-chips">
            <button type="button" className={`az-btn sm ${metroId === "all" ? "pri" : ""}`} onClick={() => setMetroId("all")}>
              All cities
            </button>
            {groupByMetro(workspace.leads.filter((lead) => !lead.archivedAt)).map((group) => (
              <button
                key={group.id}
                type="button"
                className={`az-btn sm ${metroId === group.id ? "pri" : ""}`}
                onClick={() => setMetroId(group.id)}
              >
                {group.label} {group.leads.length}
              </button>
            ))}
          </div>
          <div className="work-tabs">
            {(["live", "archived"] as const).map((item) => (
              <button key={item} type="button" className={`az-btn sm ${shelf === item ? "pri" : ""}`} onClick={() => setShelf(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>

        {importError ? <p className="rec-import-msg">{importError}</p> : null}
        {importRows ? (
          <div className="rec-import">
            <div>
              <b>{importRows.length} rows ready</b>
              <span>{importRows.filter((row) => row.duplicateOf).length} match an existing phone or email and will be merged/skipped.</span>
            </div>
            <div>
              <button className="az-btn pri sm" type="button" onClick={commitImport}>
                Import
              </button>
              <button className="az-btn sm" type="button" onClick={() => setImportRows(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <div className="az-panel overflow-auto min-h-0 crm-table-wrap">
          <table className="az-table min-w-[820px]">
            <thead>
              <tr>
                <th>Client</th>
                <th>Label</th>
                <th>Booker</th>
                <th>Source</th>
                <th>Screen</th>
                <th>Stage</th>
                <th>Tried</th>
                <th>Phone</th>
                <th>Next</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr className="cursor-default">
                  <td colSpan={9} className="py-10">
                    <div className="empty-desk" style={{ margin: 0, boxShadow: "none" }}>
                      <h2>No clients yet</h2>
                      <p>Paste a live listing, or type a real seller name. Move' will not invent a contact.</p>
                      <div className="empty-desk-actions">
                        <button className="az-btn pri sm" type="button" onClick={() => router.push("/discover?tab=paste")}>
                          Paste a listing
                        </button>
                        <button className="az-btn sm" type="button" onClick={() => setAdding(true)}>
                          Add from a call
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null}
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className={lead.id === selectedId ? "on" : ""}
                  onClick={() => {
                    setSelectedId(lead.id);
                    setSelectedLeadId(lead.id);
                  }}
                >
                  <td>
                    <div className="font-medium">{lead.name}</div>
                    <div className="text-[12px] text-[var(--muted)]">
                      {companyName(lead) || "—"} · {leadLocation(lead) || "—"}
                    </div>
                  </td>
                  <td>{lead.label || "Unlabeled"}</td>
                  <td>{lead.booker || "—"}</td>
                  <td>{lead.source}</td>
                  <td className="az-num">{lead.freightScore ?? "—"}</td>
                  <td>
                    <span className="az-chip">{lead.status}</span>
                  </td>
                  <td className="az-num">{lead.attempts || 0}</td>
                  <td className="az-num">{lead.phone ? phonePretty(lead.phone) : "—"}</td>
                  <td className="text-[12px] text-[var(--muted)] max-w-[240px]">
                    <div className="truncate">{lead.nextAction || "—"}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected ? <LeadDrawer lead={selected} onClose={() => setSelectedId(null)} /> : null}
        {adding ? (
          <div className="az-overlay" onClick={() => setAdding(false)}>
            <aside className="az-drawer" onClick={(event) => event.stopPropagation()}>
              <h2>Add client</h2>
              <p className="cd-mono">Type facts you have. Leave phone blank if it was not published.</p>
              <form className="rec-form" onSubmit={addLead}>
                {addError ? <p className="rec-warn">{addError}</p> : null}
                <label className="rec-field">
                  Name / company
                  <input
                    className="az-input"
                    value={addForm.name}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Westside Machinery LLC"
                    autoFocus
                  />
                </label>
                <label className="rec-field">
                  Published phone
                  <input
                    className="az-input"
                    value={addForm.phone}
                    onChange={(event) => setAddForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="Only if it was on the page or they gave it"
                  />
                </label>
                <div className="rec-grid">
                  <label className="rec-field">
                    City
                    <input
                      className="az-input"
                      value={addForm.city}
                      onChange={(event) => setAddForm((prev) => ({ ...prev, city: event.target.value }))}
                    />
                  </label>
                  <label className="rec-field">
                    State
                    <input
                      className="az-input"
                      value={addForm.state}
                      onChange={(event) => setAddForm((prev) => ({ ...prev, state: event.target.value }))}
                      placeholder="TX"
                    />
                  </label>
                </div>
                <div className="rec-save">
                  <button className="az-btn pri" type="submit">
                    Save
                  </button>
                  <button className="az-btn" type="button" onClick={() => setAdding(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}

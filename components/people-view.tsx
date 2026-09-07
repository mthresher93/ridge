"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { nowIso, phonePretty } from "@/lib/format";
import { createLinkedOpportunity } from "@/lib/crm";
import { contactsToCsv, downloadText, parseContactCsv, type ImportDraft } from "@/lib/contacts";
import { LeadDrawer } from "./lead-drawer";
import { blankProspect, companyName, ingestCapture, leadLocation, matchesProspectFilter, type ProspectFilter } from "@/lib/freight";

const FILTERS: { id: ProspectFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unlabeled", label: "Unlabeled" },
  { id: "uncontacted", label: "Uncontacted" },
  { id: "talking", label: "Talking" },
  { id: "quote", label: "Quote" },
  { id: "recurring", label: "Recurring" },
];

export function PeopleView() {
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
  const minScore = Number(searchParams.get("score") || 0);

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
      if (minScore && (lead.freightScore || 0) < minScore) return false;
      const hay = [lead.name, companyName(lead), lead.label, lead.city, lead.state, lead.phone, lead.email, lead.owner, lead.source, lead.category, lead.equipmentType, lead.listingTitle].join(" ").toLowerCase();
      return !query || hay.includes(query.toLowerCase());
    });
  }, [workspace.leads, query, filter, shelf, minScore]);

  const selected = workspace.leads.find((lead) => lead.id === selectedId) || null;

  function addLead() {
    const id = `lead-${crypto.randomUUID?.() || Date.now()}`;
    const prospect = blankProspect(workspace.settings.defaultOwner, { id, name: "New client", status: "Discovered" });
    setWorkspace((prev) => {
      const withLead = { ...prev, leads: [prospect, ...prev.leads], updatedAt: nowIso() };
      const opp = createLinkedOpportunity(withLead, id, prospect.name, companyName(prospect));
      return { ...withLead, opportunities: [opp, ...withLead.opportunities] };
    });
    log("lead", id, "created", "Client created");
    setSelectedId(id);
    setSelectedLeadId(id);
  }

  function exportCsv() {
    downloadText(`haul-clients-${shelf}.csv`, contactsToCsv(leads));
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
              {leads.length} {shelf} · you label what they are. Listing prices stay on the listing, not as your rate.
            </p>
          </div>
          <div className="rec-head-actions">
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
            <button className="az-btn pri sm" onClick={addLead}>
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
                <th>Source</th>
                <th>Screen</th>
                <th>Stage</th>
                <th>Phone</th>
                <th>Next</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr className="cursor-default">
                  <td colSpan={7} className="py-10 text-center text-[var(--muted)]">
                    No clients yet. Hunt a live listing or add one.
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
                  <td>{lead.source}</td>
                  <td className="az-num">{lead.freightScore ?? "—"}</td>
                  <td>
                    <span className="az-chip">{lead.status}</span>
                  </td>
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
      </div>
    </div>
  );
}

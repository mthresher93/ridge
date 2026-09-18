"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { money } from "@/lib/format";
import { nowIso } from "@/lib/clock";
import {
  CRM_STAGES,
  dealsByStage,
  moveLeadToCrmStage,
  pipelineCsv,
  type CrmStageId,
} from "@/lib/crm-pipeline";
import { workPath } from "@/lib/nav";
import { PageHeader } from "./crm/page-header";
import { DealCard } from "./crm/deal-card";

const COL_GAP = 14;
const COL_NARROW = 280;
const COL_WIDE = 320;
const PAGE_SIZE = 4;

export function PipelineView() {
  const router = useRouter();
  const { workspace, loading, setWorkspace, setSelectedLeadId, log } = useWorkspace();
  const [mode, setMode] = useState<"board" | "list">("board");
  const [wide, setWide] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [visible, setVisible] = useState<boolean[]>(CRM_STAGES.map((_, i) => i < PAGE_SIZE));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropId, setDropId] = useState<CrmStageId | null>(null);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("all");
  const trackRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Record<string, HTMLElement | null>>({});

  const columns = useMemo(() => dealsByStage(workspace), [workspace]);
  const owners = useMemo(() => {
    const names = new Set(workspace.leads.map((lead) => lead.owner).filter(Boolean));
    return ["all", ...Array.from(names)];
  }, [workspace.leads]);

  const filtered = useMemo(
    () =>
      columns.map((col) => ({
        ...col,
        deals: col.deals.filter((deal) => {
          if (owner !== "all" && deal.owner !== owner) return false;
          if (!query.trim()) return true;
          const hay = [deal.lead.name, deal.company, deal.contact, deal.lead.city, deal.lead.phone].join(" ").toLowerCase();
          return hay.includes(query.trim().toLowerCase());
        }),
      })),
    [columns, owner, query],
  );

  const liveCount = filtered.reduce((sum, col) => sum + col.deals.length, 0);
  const weighted = filtered.reduce((sum, col) => sum + col.deals.reduce((n, deal) => n + deal.value * (deal.probability / 100), 0), 0);

  useEffect(() => {
    const nodes = CRM_STAGES.map((stage) => colRefs.current[stage.id]).filter(Boolean) as HTMLElement[];
    if (!nodes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = [...prev];
          for (const entry of entries) {
            const id = entry.target.getAttribute("data-stage");
            const index = CRM_STAGES.findIndex((stage) => stage.id === id);
            if (index >= 0) next[index] = entry.intersectionRatio >= 0.55;
          }
          return next;
        });
      },
      { root: trackRef.current, threshold: [0.55] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [mode, wide, lostOpen, loading]);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey) return;
      event.preventDefault();
      el.scrollBy({ left: event.deltaY, behavior: "smooth" });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mode]);

  function colWidth() {
    return wide ? COL_WIDE : COL_NARROW;
  }

  function scrollToStage(id: string) {
    colRefs.current[id]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }

  function slide(direction: -1 | 1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * PAGE_SIZE * (colWidth() + COL_GAP), behavior: "smooth" });
  }

  function dropOn(stageId: CrmStageId) {
    if (!dragging) return;
    setWorkspace((prev) => moveLeadToCrmStage(prev, dragging, stageId, nowIso()));
    log("lead", dragging, "stage", `Moved to ${stageId}`);
    setDragging(null);
    setDropId(null);
  }

  function exportCsv() {
    const blob = new Blob([pipelineCsv(workspace)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "haul-pipeline.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="cd-body text-[var(--vx-text-3)]">Loading pipeline…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk pipeline-desk">
        <PageHeader
          title="Pipeline"
          subtitle={`${liveCount} deals · weighted ${money(weighted)} · 8 stages, 4 in view`}
          controls={
            <>
              <div className="work-tabs">
                <button type="button" className={`az-btn sm ${mode === "board" ? "pri" : ""}`} onClick={() => setMode("board")}>
                  Board
                </button>
                <button type="button" className={`az-btn sm ${mode === "list" ? "pri" : ""}`} onClick={() => setMode("list")}>
                  List
                </button>
                <button type="button" className={`az-btn sm ${wide ? "pri" : ""}`} onClick={() => setWide((on) => !on)}>
                  Wide
                </button>
              </div>
              <button className="az-btn sm" type="button" onClick={exportCsv}>
                Export CSV
              </button>
              <button className="az-btn pri sm" type="button" onClick={() => router.push("/discover")}>
                + Add Deal
              </button>
            </>
          }
          filters={
            <>
              <label className="crm-filter">
                <span>Search</span>
                <input className="az-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Yard, city, booker" />
              </label>
              <label className="crm-filter">
                <span>Owner</span>
                <select className="az-input" value={owner} onChange={(event) => setOwner(event.target.value)}>
                  {owners.map((name) => (
                    <option key={name} value={name}>
                      {name === "all" ? "All owners" : name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="az-chip tabular-nums">{liveCount} active</span>
            </>
          }
        />

        {mode === "board" ? (
          <>
            <div className="pipeline-map">
              {CRM_STAGES.map((stage, index) => (
                <button
                  key={stage.id}
                  type="button"
                  className={`pipeline-dot accent-${stage.accent}${visible[index] ? " on" : ""}`}
                  aria-label={stage.label}
                  onClick={() => {
                    if (stage.id === "lost") setLostOpen(true);
                    scrollToStage(stage.id);
                  }}
                />
              ))}
              <button className="az-btn sm" type="button" onClick={() => slide(-1)}>
                ‹ Prev 4
              </button>
              <button className="az-btn sm" type="button" onClick={() => slide(1)}>
                Next 4 ›
              </button>
            </div>

            <div className="pipeline-frame">
              <div className="pipeline-fade start" />
              <div className={`pipeline-slide${wide ? " is-wide" : ""}`} ref={trackRef}>
                {filtered.map(({ stage, deals, value }) => {
                  const collapsed = stage.id === "lost" && !lostOpen;
                  return (
                    <section
                      key={stage.id}
                      data-stage={stage.id}
                      ref={(node) => {
                        colRefs.current[stage.id] = node;
                      }}
                      className={`pipeline-col accent-${stage.accent}${collapsed ? " is-collapsed" : ""}${dropId === stage.id ? " drop" : ""}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDropId(stage.id);
                      }}
                      onDragLeave={() => setDropId((id) => (id === stage.id ? null : id))}
                      onDrop={(event) => {
                        event.preventDefault();
                        dropOn(stage.id);
                      }}
                    >
                      <header className="pipeline-col-head">
                        <div>
                          <div className="pipeline-col-title">{stage.label}</div>
                          <div className="pipeline-col-meta tabular-nums">
                            {deals.length} · {stage.probability}% · {value ? money(value) : "—"}
                          </div>
                        </div>
                        {stage.id === "lost" ? (
                          <button className="az-btn sm" type="button" onClick={() => setLostOpen((open) => !open)}>
                            {lostOpen ? "Hide" : "Show"}
                          </button>
                        ) : null}
                      </header>
                      {collapsed ? (
                        <p className="board-empty">{deals.length}</p>
                      ) : (
                        <div className="pipeline-col-body">
                          {deals.length === 0 ? <p className="board-empty">Drop a deal here</p> : null}
                          {deals.map((deal) => (
                            <DealCard
                              key={deal.lead.id}
                              deal={deal}
                              onDragStart={() => setDragging(deal.lead.id)}
                              onOpen={() => {
                                setSelectedLeadId(deal.lead.id);
                                router.push(workPath(deal.lead.id));
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
              <div className="pipeline-fade end" />
            </div>
          </>
        ) : (
          <div className="az-panel overflow-auto min-h-0 crm-table-wrap">
            <table className="az-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Stage</th>
                  <th>Grade</th>
                  <th>Value</th>
                  <th>%</th>
                  <th>Booker</th>
                  <th>Next</th>
                </tr>
              </thead>
              <tbody>
                {filtered.flatMap((col) => col.deals).length === 0 ? (
                  <tr className="cursor-default">
                    <td colSpan={7} className="py-10 text-center text-[var(--vx-text-3)]">
                      No deals match. Hunt a listing.
                    </td>
                  </tr>
                ) : null}
                {filtered.flatMap((col) =>
                  col.deals.map((deal) => (
                    <tr
                      key={deal.lead.id}
                      onClick={() => {
                        setSelectedLeadId(deal.lead.id);
                        router.push(workPath(deal.lead.id));
                      }}
                    >
                      <td>
                        <div className="font-medium">{deal.lead.name}</div>
                      </td>
                      <td>{col.stage.label}</td>
                      <td className="tabular-nums">{deal.health.grade}</td>
                      <td className="az-num tabular-nums">{deal.value ? money(deal.value) : "—"}</td>
                      <td className="tabular-nums">{deal.probability}%</td>
                      <td>{deal.contact || "—"}</td>
                      <td>{deal.lead.nextAction || "—"}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

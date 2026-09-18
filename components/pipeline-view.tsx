"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { money } from "@/lib/format";
import { nowIso } from "@/lib/clock";
import { CRM_STAGES, moveLeadToCrmStage, pipelineCsv, type CrmStageId, type DealCardModel } from "@/lib/crm-pipeline";
import {
  PIPELINE_KINDS,
  closeDateOf,
  dealHealthScore,
  daysInStage,
  dealsByOpenStage,
  filterDeals,
  isStageStale,
  nextStageId,
  openPipeline,
  pipelineVelocity,
  siteCount,
  weightedPipeline,
  weightedValue,
  wonRevenue,
  type PipelineKind,
} from "@/lib/selectors";
import { workPath } from "@/lib/nav";
import { browserTelephony } from "@/lib/telephony";
import { PageHeader } from "./crm/page-header";
import { DealCard } from "./crm/deal-card";
import { DealDetailDrawer } from "./crm/deal-drawer";

const COL_GAP = 14;
const COL_NARROW = 280;
const COL_WIDE = 320;
const PAGE_SIZE = 4;
const COLLAPSE_KEY = "haul.pipeline.collapsed";

function readCollapsed(): CrmStageId[] {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return ["lost"];
    const parsed = JSON.parse(raw) as string[];
    return parsed.filter((id): id is CrmStageId => CRM_STAGES.some((stage) => stage.id === id));
  } catch {
    return ["lost"];
  }
}

export function PipelineView() {
  const router = useRouter();
  const { workspace, loading, setWorkspace, setSelectedLeadId, log } = useWorkspace();
  const [mode, setMode] = useState<"board" | "list">("board");
  const [wide, setWide] = useState(false);
  const [visible, setVisible] = useState<boolean[]>(CRM_STAGES.map((_, i) => i < PAGE_SIZE));
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropId, setDropId] = useState<CrmStageId | null>(null);
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("all");
  const [kind, setKind] = useState<PipelineKind>("all");
  const [minHealth, setMinHealth] = useState(0);
  const [myDeals, setMyDeals] = useState(false);
  const [closeFrom, setCloseFrom] = useState("");
  const [closeTo, setCloseTo] = useState("");
  const [collapsed, setCollapsed] = useState<CrmStageId[]>(["lost"]);
  const [focus, setFocus] = useState<{ stage: CrmStageId; index: number }>({ stage: "new", index: 0 });
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ leadId: string; from: CrmStageId; label: string } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Record<string, HTMLElement | null>>({});
  const undoTimer = useRef<number>(0);

  const me = workspace.settings.operator || workspace.settings.defaultOwner || "Michael";
  const deals = useMemo(
    () =>
      filterDeals(workspace, {
        query,
        owner,
        kind,
        minHealth,
        myDeals,
        closeFrom,
        closeTo,
        me,
      }),
    [workspace, query, owner, kind, minHealth, myDeals, closeFrom, closeTo, me],
  );
  const columns = useMemo(() => dealsByOpenStage(deals), [deals]);
  const owners = useMemo(() => {
    const names = new Set(workspace.leads.map((lead) => lead.owner).filter(Boolean));
    return ["all", ...Array.from(names)];
  }, [workspace.leads]);
  const metrics = useMemo(
    () => ({
      open: openPipeline(deals),
      weighted: weightedPipeline(deals),
      won: wonRevenue(deals, workspace),
      velocity: pipelineVelocity(deals, workspace),
      sites: siteCount(workspace),
    }),
    [deals, workspace],
  );
  const drawerDeal = deals.find((deal) => deal.lead.id === drawerId) || null;

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
  }, [collapsed]);

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
  }, [mode, wide, collapsed, loading]);

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

  function toggleCollapse(id: CrmStageId) {
    setCollapsed((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function dropOn(stageId: CrmStageId) {
    if (!dragging) return;
    moveDeal(dragging, stageId);
    setDragging(null);
    setDropId(null);
  }

  function moveDeal(leadId: string, stageId: CrmStageId, toastLabel?: string) {
    const current = deals.find((deal) => deal.lead.id === leadId);
    if (!current || current.stageId === stageId) return;
    setWorkspace((prev) => moveLeadToCrmStage(prev, leadId, stageId, nowIso()));
    log("lead", leadId, "stage", `Moved to ${stageId}`);
    window.clearTimeout(undoTimer.current);
    setToast({ leadId, from: current.stageId, label: toastLabel || `Moved to ${stageId}` });
    undoTimer.current = window.setTimeout(() => setToast(null), 6000);
  }

  function undoMove() {
    if (!toast) return;
    setWorkspace((prev) => moveLeadToCrmStage(prev, toast.leadId, toast.from, nowIso()));
    setToast(null);
  }

  function advance(deal: DealCardModel) {
    const next = nextStageId(deal.stageId);
    if (!next) return;
    moveDeal(deal.lead.id, next, `Advanced to ${next}`);
  }

  function callDeal(deal: DealCardModel) {
    if (!deal.lead.phone) return;
    browserTelephony().startCall(deal.lead.phone);
    setSelectedLeadId(deal.lead.id);
    router.push(workPath(deal.lead.id));
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

  function onBoardKey(event: KeyboardEvent<HTMLDivElement>) {
    const col = columns.find((item) => item.stage.id === focus.stage) || columns[0];
    const colIndex = columns.findIndex((item) => item.stage.id === focus.stage);
    if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const deal = col.deals[focus.index];
      if (!deal) return;
      const target = columns[colIndex + (event.key === "ArrowRight" ? 1 : -1)];
      if (!target || target.stage.id === "lost" && deal.stageId === "won") return;
      if (target) moveDeal(deal.lead.id, target.stage.id);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const next = columns[colIndex + (event.key === "ArrowRight" ? 1 : -1)];
      if (!next) return;
      setFocus({ stage: next.stage.id, index: 0 });
      scrollToStage(next.stage.id);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setFocus({ stage: col.stage.id, index: Math.max(0, Math.min(col.deals.length - 1, focus.index + delta)) });
    }
    if (event.key === "Enter" && col.deals[focus.index]) setDrawerId(col.deals[focus.index].lead.id);
  }

  if (loading) return <div className="cd-body text-[var(--vx-text-3)]">Loading pipeline…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk pipeline-desk">
        <PageHeader
          title="Pipeline"
          subtitle="Open value excludes Won and Lost. Four stages in view."
          controls={
            <>
              <label className="crm-filter">
                <span>Pipeline</span>
                <select className="az-input" value={kind} onChange={(event) => setKind(event.target.value as PipelineKind)} aria-label="Pipeline selector">
                  {PIPELINE_KINDS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="work-tabs">
                <button type="button" className={`az-btn sm ${mode === "board" ? "pri" : ""}`} onClick={() => setMode("board")}>
                  Board view
                </button>
                <button type="button" className={`az-btn sm ${mode === "list" ? "pri" : ""}`} onClick={() => setMode("list")}>
                  List table
                </button>
                <button type="button" className={`az-btn sm ${wide ? "pri" : ""}`} onClick={() => setWide((on) => !on)}>
                  Wide
                </button>
              </div>
              <button className="az-btn sm" type="button" aria-label="Open deal map" onClick={() => router.push("/map")}>
                Deal map · {metrics.sites}
              </button>
              <button className="az-btn sm" type="button" onClick={exportCsv}>
                Export CSV
              </button>
              <button className="az-btn pri sm" type="button" onClick={() => router.push("/discover")}>
                + Add deal
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
                <select className="az-input" value={owner} onChange={(event) => setOwner(event.target.value)} aria-label="Owner">
                  {owners.map((name) => (
                    <option key={name} value={name}>
                      {name === "all" ? "All owners" : name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="crm-filter">
                <span>Close from</span>
                <input className="az-input" type="date" value={closeFrom} onChange={(event) => setCloseFrom(event.target.value)} />
              </label>
              <label className="crm-filter">
                <span>Close to</span>
                <input className="az-input" type="date" value={closeTo} onChange={(event) => setCloseTo(event.target.value)} />
              </label>
              <label className="crm-filter">
                <span>Min health</span>
                <input className="az-input" type="number" min={0} max={100} value={minHealth} onChange={(event) => setMinHealth(Number(event.target.value) || 0)} />
              </label>
              <label className="crm-filter crm-check">
                <input type="checkbox" checked={myDeals} onChange={(event) => setMyDeals(event.target.checked)} />
                My deals
              </label>
            </>
          }
        />

        <div className="pipe-metrics">
          <div>
            <b className="tabular-nums font-display">{money(metrics.open)}</b>
            <span>Open pipeline</span>
          </div>
          <div>
            <b className="tabular-nums font-display">{money(metrics.weighted)}</b>
            <span>Weighted</span>
          </div>
          <div>
            <b className="tabular-nums font-display">{money(metrics.won)}</b>
            <span>Won this month</span>
          </div>
          <div>
            <b className="tabular-nums font-display">{metrics.velocity}d</b>
            <span>Avg cycle</span>
          </div>
        </div>

        {mode === "board" ? (
          <>
            <div className="pipeline-map">
              {CRM_STAGES.map((stage, index) => (
                <button
                  key={stage.id}
                  type="button"
                  className={`pipeline-dot accent-${stage.accent}${visible[index] ? " on" : ""}`}
                  aria-label={`Jump to ${stage.label}`}
                  title={stage.label}
                  onClick={() => {
                    setCollapsed((prev) => prev.filter((id) => id !== stage.id));
                    scrollToStage(stage.id);
                  }}
                />
              ))}
              <button className="az-btn sm" type="button" aria-label="Previous four stages" onClick={() => slide(-1)}>
                ‹ Prev 4
              </button>
              <button className="az-btn sm" type="button" aria-label="Next four stages" onClick={() => slide(1)}>
                Next 4 ›
              </button>
            </div>

            <div className="pipeline-frame">
              <div
                className={`pipeline-slide${wide ? " is-wide" : ""}`}
                ref={trackRef}
                tabIndex={0}
                onKeyDown={onBoardKey}
                aria-label="Pipeline board"
              >
                {columns.map(({ stage, deals: rows, value, weighted, avgProbability }) => {
                  const isCollapsed = collapsed.includes(stage.id);
                  return (
                    <section
                      key={stage.id}
                      data-stage={stage.id}
                      ref={(node) => {
                        colRefs.current[stage.id] = node;
                      }}
                      className={`pipeline-col accent-${stage.accent}${isCollapsed ? " is-collapsed" : ""}${dropId === stage.id ? " drop" : ""}`}
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
                        <button type="button" className="pipeline-col-toggle" aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${stage.label}`} onClick={() => toggleCollapse(stage.id)}>
                          <div className="pipeline-col-title">{stage.label}</div>
                          <div className="pipeline-col-meta tabular-nums">
                            {rows.length} · {money(value)}
                          </div>
                          {!isCollapsed ? (
                            <div className="pipeline-col-sub tabular-nums">
                              Weighted {money(weighted)} · {avgProbability}% avg
                            </div>
                          ) : null}
                        </button>
                        <button className="az-btn sm" type="button" aria-label={`Add deal to ${stage.label}`} title="Add deal" onClick={() => router.push("/discover")}>
                          +
                        </button>
                      </header>
                      {isCollapsed ? (
                        <p className="board-empty tabular-nums">{rows.length}</p>
                      ) : (
                        <div className="pipeline-col-body">
                          {rows.length === 0 ? <p className="board-empty">Drop a deal here</p> : null}
                          {rows.map((deal, index) => (
                            <DealCard
                              key={deal.lead.id}
                              deal={deal}
                              health={dealHealthScore(deal, workspace)}
                              ageDays={daysInStage(deal, workspace)}
                              stale={isStageStale(deal, workspace)}
                              close={closeDateOf(deal, workspace)}
                              selected={focus.stage === stage.id && focus.index === index}
                              onDragStart={() => setDragging(deal.lead.id)}
                              onOpen={() => {
                                setDrawerId(deal.lead.id);
                                setSelectedLeadId(deal.lead.id);
                              }}
                              onAdvance={() => advance(deal)}
                              onCall={() => callDeal(deal)}
                              onIntel={() => router.push("/playbook")}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="az-panel overflow-auto min-h-0 crm-table-wrap">
            <table className="az-table min-w-[1080px]">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Stage</th>
                  <th>Health</th>
                  <th>Value</th>
                  <th>Weighted</th>
                  <th>%</th>
                  <th>Booker</th>
                  <th>Next</th>
                </tr>
              </thead>
              <tbody>
                {deals.length === 0 ? (
                  <tr className="cursor-default">
                    <td colSpan={8} className="py-10 text-center text-[var(--vx-text-3)]">
                      No deals match. Hunt a listing.
                    </td>
                  </tr>
                ) : null}
                {deals.map((deal) => (
                  <tr
                    key={deal.lead.id}
                    onClick={() => {
                      setDrawerId(deal.lead.id);
                      setSelectedLeadId(deal.lead.id);
                    }}
                  >
                    <td>
                      <div className="font-medium">{deal.lead.name}</div>
                    </td>
                    <td>{CRM_STAGES.find((stage) => stage.id === deal.stageId)?.label}</td>
                    <td className="tabular-nums">{dealHealthScore(deal, workspace)}</td>
                    <td className="az-num tabular-nums">{deal.value ? money(deal.value) : "—"}</td>
                    <td className="az-num tabular-nums">{deal.value ? money(weightedValue(deal)) : "—"}</td>
                    <td className="tabular-nums">{deal.probability}%</td>
                    <td>{deal.contact || "—"}</td>
                    <td>{deal.lead.nextAction || "No next action scheduled"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {drawerDeal ? (
          <DealDetailDrawer
            deal={drawerDeal}
            onClose={() => setDrawerId(null)}
            onStage={(id) => moveDeal(drawerDeal.lead.id, id)}
            onCall={() => callDeal(drawerDeal)}
            onIntel={() => router.push("/playbook")}
            onWork={() => router.push(workPath(drawerDeal.lead.id))}
          />
        ) : null}
        {toast ? (
          <div className="pipe-toast" role="status">
            <span>{toast.label}</span>
            <button className="az-btn sm" type="button" onClick={undoMove}>
              Undo
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

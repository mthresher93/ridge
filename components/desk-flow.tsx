"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FLOW_POINTS, type FlowState, type FlowStepId } from "@/lib/flow";

function center(id: FlowStepId) {
  const point = FLOW_POINTS[id];
  return { x: ((point.col - 0.5) / 4) * 800, y: ((point.row - 0.5) / 2) * 300 };
}

function elbow(from: FlowStepId, to: FlowStepId) {
  const a = center(from);
  const b = center(to);
  if (a.x === b.x || a.y === b.y) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  return `M ${a.x} ${a.y} L ${a.x} ${b.y} L ${b.x} ${b.y}`;
}

export function DeskFlow({
  flow,
  onStay,
}: {
  flow: FlowState;
  onStay?: (id: FlowStepId) => void;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState<FlowStepId | null>(null);
  const active = flow.steps.find((item) => item.id === (focus || flow.current)) || flow.steps[0];
  const lit = useMemo(() => {
    if (!focus) return new Set<string>();
    const set = new Set<string>([focus]);
    for (const edge of flow.edges) {
      if (edge.from === focus || edge.to === focus) {
        set.add(edge.from);
        set.add(edge.to);
        set.add(`${edge.from}-${edge.to}`);
      }
    }
    return set;
  }, [focus, flow.edges]);

  function go(id: FlowStepId) {
    const step = flow.steps.find((item) => item.id === id);
    if (!step) return;
    if (step.stay) {
      onStay?.(id);
      return;
    }
    router.push(step.href);
  }

  return (
    <section className="desk-flow" aria-label="Load flowchart">
      <header className="desk-flow-head">
        <div>
          <div className="home-kicker">Live flowchart</div>
          <p className="desk-flow-line">
            <b>{active.label}</b>
            <span>{active.hint}</span>
          </p>
        </div>
        <p className="desk-flow-legend">
          <span className="ok">Green path</span>
          <span className="hot">Red needs you</span>
        </p>
      </header>
      <div className="desk-flow-chart">
        <svg className="desk-flow-svg" viewBox="0 0 800 300" preserveAspectRatio="none" role="presentation">
          <defs>
            <filter id="flow-glow-ok" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="flow-glow-hot" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker id="flow-arrow-ok" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3dba6a" />
            </marker>
            <marker id="flow-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#e24b4b" />
            </marker>
            <marker id="flow-arrow-idle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#4a5560" />
            </marker>
          </defs>
          {flow.edges.map((edge) => {
            const key = `${edge.from}-${edge.to}`;
            const live = lit.has(key) || (!focus && (edge.tone === "ok" || edge.tone === "hot"));
            const d = elbow(edge.from, edge.to);
            return (
              <g key={key}>
                <path
                  d={d}
                  className="desk-flow-hit"
                  onMouseEnter={() => setFocus(edge.to)}
                  onMouseLeave={() => setFocus(null)}
                  onClick={() => go(edge.to)}
                />
                <path
                  d={d}
                  className={`desk-flow-edge is-${edge.tone}${live ? " is-live" : ""}`}
                  markerEnd={`url(#flow-arrow-${edge.tone})`}
                  filter={edge.tone === "idle" ? undefined : `url(#flow-glow-${edge.tone === "hot" ? "hot" : "ok"})`}
                  pointerEvents="none"
                />
              </g>
            );
          })}
        </svg>
        <div className="desk-flow-nodes">
          {flow.steps.map((step) => {
            const point = FLOW_POINTS[step.id];
            const state = step.id === flow.current ? (step.hot ? "hot" : "now") : step.id === "hunt" && flow.current === "hunt" ? "now" : lit.has(step.id) ? "live" : step.hot ? "wait" : "idle";
            return (
              <button
                key={step.id}
                type="button"
                className={`desk-flow-node is-${state}${focus === step.id ? " is-focus" : ""}`}
                style={{ gridColumn: point.col, gridRow: point.row }}
                onClick={() => go(step.id)}
                onMouseEnter={() => setFocus(step.id)}
                onMouseLeave={() => setFocus(null)}
                onFocus={() => setFocus(step.id)}
                onBlur={() => setFocus(null)}
              >
                <em>{step.n}</em>
                <strong>{step.label}</strong>
                <span>{step.count ? step.count : step.id === "hunt" ? "Go" : "—"}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

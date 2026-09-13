"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FLOW_BOXES, flowEdgePath, type FlowBox, type FlowState, type FlowStepId } from "@/lib/flow";

function nodePath(box: FlowBox) {
  const { x, y, w, h, shape } = box;
  if (shape === "decision") {
    const cx = x + w / 2;
    const cy = y + h / 2;
    return `M ${cx} ${y} L ${x + w} ${cy} L ${cx} ${y + h} L ${x} ${cy} Z`;
  }
  const r = shape === "process" ? 8 : h / 2;
  return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
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
          <div className="home-kicker">Flowchart</div>
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
        <svg className="desk-flow-svg" viewBox="0 0 760 300" role="img">
          <title>Hunt to Track load flowchart</title>
          <defs>
            <marker id="flow-arrow-ok" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#22e36a" />
            </marker>
            <marker id="flow-arrow-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff3b3b" />
            </marker>
          </defs>
          {flow.edges.map((edge) => {
            const key = `${edge.from}-${edge.to}`;
            const live = lit.has(key) || !focus;
            const hot = edge.tone === "hot";
            const d = flowEdgePath(edge.from, edge.to);
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
                  className={`desk-flow-glow is-${hot ? "hot" : "ok"}${live ? " is-live" : ""}`}
                  stroke={hot ? "#ff3b3b" : "#22e36a"}
                  pointerEvents="none"
                />
                <path
                  d={d}
                  className={`desk-flow-edge is-${hot ? "hot" : "ok"}${live ? " is-live" : ""}`}
                  stroke={hot ? "#ff3b3b" : "#22e36a"}
                  markerEnd={`url(#flow-arrow-${hot ? "hot" : "ok"})`}
                  pointerEvents="none"
                />
              </g>
            );
          })}
          {flow.steps.map((step) => {
            const box = FLOW_BOXES[step.id];
            const state = step.id === flow.current ? (step.hot ? "hot" : "now") : lit.has(step.id) ? "live" : step.hot ? "wait" : "idle";
            const cx = box.x + box.w / 2;
            const cy = box.y + box.h / 2;
            return (
              <g
                key={step.id}
                className={`desk-flow-g is-${state}${focus === step.id ? " is-focus" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => go(step.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    go(step.id);
                  }
                }}
                onMouseEnter={() => setFocus(step.id)}
                onMouseLeave={() => setFocus(null)}
                onFocus={() => setFocus(step.id)}
                onBlur={() => setFocus(null)}
              >
                <path d={nodePath(box)} className="desk-flow-shape" />
                <text className="desk-flow-label" x={cx} y={cy - 6}>
                  {step.n} {step.label}
                </text>
                <text className="desk-flow-count" x={cx} y={cy + 12}>
                  {step.count ? step.count : step.id === "hunt" ? "start" : "—"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

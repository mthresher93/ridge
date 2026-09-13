"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GRAPH,
  flowAreaPath,
  flowCurvePath,
  flowGraphPoints,
  flowSegmentPath,
  type FlowState,
  type FlowStepId,
} from "@/lib/flow";

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
  const points = useMemo(() => flowGraphPoints(flow.steps), [flow.steps]);
  const curve = useMemo(() => flowCurvePath(points), [points]);
  const area = useMemo(() => flowAreaPath(points), [points]);
  const baseline = GRAPH.h - GRAPH.b;
  const hot = useMemo(
    () =>
      flow.edges
        .map((edge, index) => ({ edge, index, d: flowSegmentPath(points, index) }))
        .filter((item) => item.edge.tone === "hot" && item.d),
    [flow.edges, points],
  );

  function go(id: FlowStepId) {
    const step = flow.steps.find((item) => item.id === id);
    if (!step) return;
    if (step.stay) {
      onStay?.(id);
      return;
    }
    router.push(step.href);
  }

  const focused = points.find((item) => item.id === focus) || null;

  return (
    <section className="desk-flow" aria-label="Load graph">
      <header className="desk-flow-head">
        <div>
          <div className="home-kicker">Live graph</div>
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
        <svg className="desk-flow-svg" viewBox={`0 0 ${GRAPH.w} ${GRAPH.h}`} role="img">
          <title>Hunt to Track as a line graph</title>
          <defs>
            <linearGradient id="flow-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22e36a" stopOpacity="0.32" />
              <stop offset="70%" stopColor="#22e36a" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#22e36a" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="flow-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7dffb0" />
              <stop offset="45%" stopColor="#22e36a" />
              <stop offset="100%" stopColor="#14b85a" />
            </linearGradient>
            <filter id="flow-line-glow" x="-80" y="-40" width="920" height="330" filterUnits="userSpaceOnUse">
              <feGaussianBlur stdDeviation="3.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((t) => {
            const y = GRAPH.t + (GRAPH.h - GRAPH.t - GRAPH.b) * t;
            return <line key={t} className="desk-flow-grid" x1={GRAPH.l} x2={GRAPH.w - GRAPH.r} y1={y} y2={y} />;
          })}
          {area ? <path d={area} fill="url(#flow-fill)" pointerEvents="none" /> : null}
          <path d={curve} className="desk-flow-glow is-ok is-live" stroke="url(#flow-stroke)" pointerEvents="none" />
          <path
            d={curve}
            className="desk-flow-edge is-ok is-live"
            stroke="url(#flow-stroke)"
            filter="url(#flow-line-glow)"
            pointerEvents="none"
          />
          {hot.map((item) => (
            <g key={`${item.edge.from}-${item.edge.to}`}>
              <path d={item.d} className="desk-flow-glow is-hot is-live" stroke="#ff3b3b" pointerEvents="none" />
              <path d={item.d} className="desk-flow-edge is-hot is-live" stroke="#ff4d4d" pointerEvents="none" />
            </g>
          ))}
          {focused ? (
            <line className="desk-flow-hair" x1={focused.x} x2={focused.x} y1={GRAPH.t} y2={baseline} />
          ) : null}
          {points.map((point, index) => {
            const step = flow.steps[index];
            const state = step.id === flow.current ? (step.hot ? "hot" : "now") : step.hot ? "wait" : focus === step.id ? "live" : "idle";
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
                <line className="desk-flow-tick" x1={point.x} x2={point.x} y1={baseline} y2={baseline + 6} />
                <circle className="desk-flow-dot-hit" cx={point.x} cy={point.y} r="16" />
                <circle className="desk-flow-dot" cx={point.x} cy={point.y} r={step.id === flow.current || focus === step.id ? 7 : 5} />
                {step.count ? (
                  <text className="desk-flow-value" x={point.x} y={point.y - 14}>
                    {step.count}
                  </text>
                ) : null}
                <text className="desk-flow-label" x={point.x} y={baseline + 22}>
                  {step.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";

export type CockpitStage = {
  n: string;
  label: string;
  p: string;
  pct: number;
  detail: string;
};

export function Cockpit({
  kicker,
  title,
  blurb,
  stages,
  kpis,
}: {
  kicker: string;
  title: string;
  blurb: string;
  stages: CockpitStage[];
  kpis: { l: string; v: string; p: string }[];
}) {
  const [i, setI] = useState(0);
  const active = stages[i] || stages[0];

  return (
    <div className="visual-system">
      <div className="visual-top">
        <div>
          <div className="cd-mono" style={{ color: "var(--cy)" }}>
            {kicker}
          </div>
          <h3>{title}</h3>
          <p>{blurb}</p>
        </div>
        <span className="cd-chip inf">INTERACTIVE</span>
      </div>
      <div className="visual-grid">
        <div>
          <div className="visual-deck">
            {stages.map((stage, index) => (
              <button
                key={stage.label}
                type="button"
                className={`visual-stage ${i === index ? "on" : ""}`}
                onClick={() => setI(index)}
              >
                <div className="num">
                  {stage.n} · {stage.pct}%
                </div>
                <b>{stage.label}</b>
                <p>{stage.p}</p>
                <div className="visual-meter">
                  <span style={{ width: `${stage.pct}%` }} />
                </div>
              </button>
            ))}
          </div>
          <div className="visual-detail">
            <b>Selected stage</b>
            <span>{active?.detail}</span>
          </div>
        </div>
        <div className="visual-side">
          <div className="visual-mini-bars">
            {stages.concat(stages).slice(0, 7).map((stage, index) => (
              <span key={`${stage.label}-${index}`} style={{ height: `${Math.max(28, stage.pct)}%` }} />
            ))}
          </div>
          <div className="visual-assess">
            {kpis.map((kpi) => (
              <div key={kpi.l} className="visual-kpi">
                <div className="l">{kpi.l}</div>
                <div className="v">{kpi.v}</div>
                <p>{kpi.p}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { objectionsFor, scriptFor } from "@/lib/scripts";
import type { Lead, RoofDesign } from "@/lib/types";

export function ScriptPanel({
  lead,
  design,
  beat,
  onBeat,
  large = false,
  mode = "split",
}: {
  lead: Lead | null;
  design?: RoofDesign | null;
  beat: number;
  onBeat: (index: number) => void;
  large?: boolean;
  mode?: "collapsed" | "split" | "focus";
}) {
  const [tab, setTab] = useState<"script" | "objections">("script");
  const [query, setQuery] = useState("");
  const beats = tab === "script" ? scriptFor(lead, design) : objectionsFor(lead);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return beats.map((item, index) => ({ item, index }));
    return beats
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => `${item.label} ${item.say} ${item.cue}`.toLowerCase().includes(q));
  }, [beats, query]);
  const current = Math.min(beat, Math.max(0, beats.length - 1));
  const active = beats[current];
  const stage = large || mode === "focus";

  return (
    <section className={`script-card ${stage ? "script-stage" : ""} ${mode === "focus" ? "script-focus" : ""}`}>
      <div className="script-head">
        <span>Script</span>
        <span className="az-num">
          {String(current + 1).padStart(2, "0")} / {String(beats.length).padStart(2, "0")}
        </span>
      </div>
      <div className="script-tools">
        <button type="button" className={tab === "script" ? "on" : ""} onClick={() => setTab("script")}>
          Talk track
        </button>
        <button type="button" className={tab === "objections" ? "on" : ""} onClick={() => setTab("objections")}>
          Objections
        </button>
        <input
          className="script-search"
          placeholder="Jump to a section"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {stage && active ? (
        <div className="script-now">
          <div className="script-now-meta">
            <b>{active.label}</b>
            <span>{active.cue}</span>
          </div>
          <p className="script-now-say">{active.say}</p>
          <div className="script-now-nav">
            <button type="button" className="az-btn" disabled={current === 0} onClick={() => onBeat(Math.max(0, current - 1))}>
              Back
            </button>
            <button
              type="button"
              className="az-btn pri"
              disabled={current >= beats.length - 1}
              onClick={() => onBeat(Math.min(beats.length - 1, current + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <div className="script-list">
        {filtered.map(({ item, index }) => (
          <button key={`${tab}-${item.id}`} type="button" className={`script-beat ${index === current ? "active" : ""}`} onClick={() => onBeat(index)}>
            <span className="script-idx">{String(index + 1).padStart(2, "0")}</span>
            <span className="script-copy">
              <span className="script-label">
                {item.label}
                <i>{item.cue}</i>
              </span>
              {stage ? null : <span className="say">{item.say}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

"use client";

import { useMemo } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { derive } from "@/lib/derive";
import { Station } from "./page-intro";

export function AnalyticsView() {
  const { workspace, loading } = useWorkspace();
  const metrics = useMemo(() => derive(workspace), [workspace]);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of workspace.kpiEvents) {
      map.set(event.type, (map.get(event.type) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [workspace.kpiEvents]);

  const byCity = useMemo(() => {
    const map = new Map<string, number>();
    for (const lead of workspace.leads) {
      const city = lead.city || "Unset";
      map.set(city, (map.get(city) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [workspace.leads]);

  const maxType = Math.max(...byType.map((item) => item[1]), 1);
  const maxCity = Math.max(...byCity.map((item) => item[1]), 1);

  if (loading) return <div className="cd-body text-[var(--tx4)]">Crunching recorded events…</div>;

  return (
    <Station
      n="12"
      title="Analytics"
      lede={
        <>
          Counts from <em>kpiEvents and the board</em>. Current will not project a win rate you have not earned.
        </>
      }
      chip={`${workspace.kpiEvents.length} EVENTS`}
    >
      <div className="metric-strip" style={{ marginBottom: 16 }}>
        <div className="ms-cell">
          <div className="ms-l">Dials</div>
          <div className="ms-v cy">{metrics.attempts}</div>
          <div className="ms-d">recorded attempts</div>
        </div>
        <div className="ms-cell">
          <div className="ms-l">Connect</div>
          <div className="ms-v">{metrics.connectRate}%</div>
          <div className="ms-d">{metrics.connected} live</div>
        </div>
        <div className="ms-cell">
          <div className="ms-l">Sets</div>
          <div className="ms-v" style={{ color: "var(--tl)" }}>
            {metrics.sets}
          </div>
          <div className="ms-d">{metrics.setRate}% of dials</div>
        </div>
        <div className="ms-cell">
          <div className="ms-l">Due</div>
          <div className="ms-v" style={{ color: "var(--am)" }}>
            {metrics.dueCallbacks.length}
          </div>
          <div className="ms-d">callbacks</div>
        </div>
        <div className="ms-cell">
          <div className="ms-l">Sits</div>
          <div className="ms-v">{metrics.upcoming.length}</div>
          <div className="ms-d">on the book</div>
        </div>
        <div className="ms-cell">
          <div className="ms-l">Stalled</div>
          <div className="ms-v" style={{ color: "var(--rd)" }}>
            {metrics.stalled.length}
          </div>
          <div className="ms-d">critical deals</div>
        </div>
      </div>

      <div className="cd-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <section className="cd-glass">
          <div className="cd-head">
            <h3>Event mix</h3>
            <span className="r">recorded types</span>
          </div>
          <div className="live-bars" style={{ height: 200 }}>
            {byType.slice(0, 8).map(([label, value]) => (
              <div key={label} className="live-bar">
                <div className="az-num">{value}</div>
                <div className="bar" style={{ height: `${Math.max(8, (value / maxType) * 100)}%` }} />
                <div className="lab">{label.replaceAll("_", " ")}</div>
              </div>
            ))}
            {byType.length === 0 ? <p className="cd-mono">No events yet. Dial first.</p> : null}
          </div>
        </section>
        <section className="cd-glass">
          <div className="cd-head">
            <h3>City demand</h3>
            <span className="r">leads on file</span>
          </div>
          <div style={{ padding: 16 }}>
            {byCity.map(([city, count]) => (
              <div key={city} className="anal-row">
                <span>{city}</span>
                <div className="anal-track">
                  <i style={{ width: `${(count / maxCity) * 100}%` }} />
                </div>
                <b className="az-num">{count}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Station>
  );
}

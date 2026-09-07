"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { derive } from "@/lib/derive";

export function AdsView() {
  const { workspace, loading } = useWorkspace();
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const [city, setCity] = useState("");
  const cities = useMemo(() => Array.from(new Set(workspace.leads.map((lead) => lead.city).filter(Boolean))), [workspace.leads]);
  const active = city || cities[0] || "";
  const count = workspace.leads.filter((lead) => lead.city === active).length;
  const callable = workspace.leads.filter((lead) => lead.city === active && !lead.dnc && lead.consent === "verified").length;
  const proof = workspace.leads.some((lead) => lead.city === active && lead.notes);
  const [lane, setLane] = useState<"bill" | "roof" | "sit">("bill");

  const lanes = {
    bill: {
      hook: `Your ${active || "West Coast"} utility bill is the number. We size the roof against it.`,
      creative: "Bill-in / bill-out card. Named household only. No invented savings.",
      cta: "Book a 15-minute bill review.",
    },
    roof: {
      hook: "If the heading is wrong, the price is theater. We draw the planes first.",
      creative: "Roof model stills from Design. Modules you can count.",
      cta: "Open a roof survey window.",
    },
    sit: {
      hook: "Both signers. Last twelve months. Forty-five minutes.",
      creative: "Sit checklist, not a lifestyle reel.",
      cta: "Hold a sit this week.",
    },
  }[lane];

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading drafts…</div>;

  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>Ads</h1>
          <p>Drafts only · no live spend · {active || "no city"} · {count} leads · {callable} callable</p>
        </div>
      </header>

      <div className="desk-body">
      <div className="cd-grid" style={{ gridTemplateColumns: "220px minmax(0,1fr) 280px" }}>
        <aside className="cd-glass" style={{ padding: 12 }}>
          <div className="cd-mono" style={{ marginBottom: 8 }}>
            Cities
          </div>
          {cities.map((name) => (
            <button key={name} type="button" className={`studio-tool ${active === name ? "on" : ""}`} onClick={() => setCity(name)}>
              <b>{name}</b>
              <p className="cd-mono">{workspace.leads.filter((lead) => lead.city === name).length} leads</p>
            </button>
          ))}
        </aside>
        <section className="cd-glass" style={{ padding: 18 }}>
          <div className="work-tabs">
            {(["bill", "roof", "sit"] as const).map((item) => (
              <button key={item} type="button" className={`az-btn sm ${lane === item ? "pri" : ""}`} onClick={() => setLane(item)}>
                {item}
              </button>
            ))}
          </div>
          <article className="ad-card">
            <div className="cd-mono">Hook</div>
            <p>{lanes.hook}</p>
            <div className="cd-mono">Creative</div>
            <p>{lanes.creative}</p>
            <div className="cd-mono">CTA</div>
            <p>{lanes.cta}</p>
          </article>
        </section>
        <aside className="cd-glass" style={{ padding: 16 }}>
          <div className="cd-mono">Status</div>
          <div className="cd-row">
            <span>Live spend</span>
            <b>$0</b>
          </div>
          <div className="cd-row">
            <span>Named notes in city</span>
            <b>{proof ? "Yes" : "No"}</b>
          </div>
          <div className="cd-row">
            <span>Overdue callbacks</span>
            <b>{metrics.overdueCallbacks.length}</b>
          </div>
          <div className="cd-row">
            <span>Callable now</span>
            <b>{metrics.callable.length}</b>
          </div>
          <p className="cd-mono" style={{ marginTop: 12, textTransform: "none", letterSpacing: 0 }}>
            Work the overdue queue before you draft more ads. Demand you already have beats a new lane.
          </p>
        </aside>
      </div>
      </div>
    </div>
  );
}

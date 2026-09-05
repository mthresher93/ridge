"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { derive } from "@/lib/derive";
import { Station } from "./page-intro";
import { Cockpit } from "./cockpit";

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
    <Station
      n="15"
      title="Ads"
      lede={
        <>
          Local campaign drafts by city. <em>Zero live spend.</em> Current will not buy media or publish a claim without proof.
        </>
      }
      chip="DRAFT · NO SPEND"
    >
      <Cockpit
        kicker="AD CAMPAIGNS"
        title="Campaign readiness cockpit"
        blurb="Is a city even safe to draft before anyone talks about spend?"
        stages={[
          { n: "01", label: "Angle", p: "Hook and buyer pain.", pct: 79, detail: "Angle defines the promise and the target buyer." },
          { n: "02", label: "Proof", p: "Claims are supported.", pct: proof ? 78 : 38, detail: "Proof prevents unsupported ad claims." },
          { n: "03", label: "Creative", p: "Assets and variants.", pct: 64, detail: "Creative includes copy, stills, CTA, and landing fit." },
          { n: "04", label: "Audience", p: "Demand on file.", pct: Math.min(99, 30 + count * 8), detail: "Audience is the recorded household count, not a purchased list." },
          { n: "05", label: "Gate", p: "Human yes required.", pct: 90, detail: "No platform connect. Draft stays local." },
        ]}
        kpis={[
          { l: "SPEND", v: "$0", p: "Live spend stays off." },
          { l: "CITY", v: active || "—", p: `${count} leads on file.` },
          { l: "CALL", v: `${callable}`, p: "Callable in this city." },
          { l: "NEXT", v: proof ? "Draft" : "Proof", p: proof ? "Copy is safe to review." : "Need a named note." },
        ]}
      />

      <div className="cd-grid" style={{ gridTemplateColumns: "220px minmax(0,1fr) 280px", marginTop: 16 }}>
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
          <div className="cd-mono">Honesty ledger</div>
          <div className="cd-row">
            <span>Live spend</span>
            <b>$0</b>
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
    </Station>
  );
}

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { derive } from "@/lib/derive";
import { money, moneyShort } from "@/lib/format";
import { estimateFor } from "@/lib/solar";
import { PIPELINE_GROUPS } from "@/lib/stages";
import { Station } from "./page-intro";

export function MoneyView() {
  const router = useRouter();
  const { workspace, loading, setSelectedLeadId } = useWorkspace();
  const metrics = useMemo(() => derive(workspace), [workspace]);
  const groups = PIPELINE_GROUPS.map((group) => {
    const rows = workspace.opportunities.filter((item) => (group.stages as readonly string[]).includes(item.stage));
    return { ...group, count: rows.length, value: rows.reduce((sum, item) => sum + (Number(item.value) || 0), 0) };
  });
  const estimates = workspace.leads
    .map((lead) => {
      const design = workspace.designs?.[lead.id];
      return design ? { lead, est: estimateFor(lead, design) } : null;
    })
    .filter(Boolean)
    .slice(0, 8) as { lead: (typeof workspace.leads)[0]; est: ReturnType<typeof estimateFor> }[];

  if (loading) return <div className="cd-body text-[var(--tx4)]">Reading money…</div>;

  return (
    <Station
      n="11"
      title="Revenue"
      lede={
        <>
          Pipeline and sized roofs only. Weighted value uses the probability you typed.
        </>
      }
      chip="RECORDED · LOCAL"
    >
      <div className="metric-strip" style={{ marginBottom: 16 }}>
        <div className="ms-cell">
          <div className="ms-l">Open</div>
          <div className="ms-v cy">{moneyShort(metrics.openValue)}</div>
          <div className="ms-d">{metrics.open.length} deals</div>
        </div>
        <div className="ms-cell">
          <div className="ms-l">Weighted</div>
          <div className="ms-v">{moneyShort(metrics.weighted)}</div>
          <div className="ms-d">your probabilities</div>
        </div>
        <div className="ms-cell">
          <div className="ms-l">Won-adj</div>
          <div className="ms-v" style={{ color: "var(--tl)" }}>
            {moneyShort(metrics.wonValue)}
          </div>
          <div className="ms-d">Closed Won + PTO</div>
        </div>
        <div className="ms-cell">
          <div className="ms-l">Coverage</div>
          <div className="ms-v">{metrics.coverage}%</div>
          <div className="ms-d">next action present</div>
        </div>
        <div className="ms-cell">
          <div className="ms-l">Stalled</div>
          <div className="ms-v" style={{ color: "var(--rd)" }}>
            {metrics.stalled.length}
          </div>
          <div className="ms-d">critical deals</div>
        </div>
        <div className="ms-cell">
          <div className="ms-l">Designs</div>
          <div className="ms-v" style={{ color: "var(--vi)" }}>
            {Object.keys(workspace.designs || {}).length}
          </div>
          <div className="ms-d">roof models</div>
        </div>
      </div>

      <div className="cd-grid" style={{ gridTemplateColumns: "1.2fr .8fr" }}>
        <section className="cd-glass">
          <div className="cd-head">
            <h3>Stage money</h3>
            <span className="r">board values</span>
          </div>
          <div style={{ padding: 16 }}>
            {groups.map((group) => (
              <div key={group.id} className="cd-row">
                <div>
                  <b>{group.label}</b>
                  <div className="cd-mono">{group.count} deals</div>
                </div>
                <b className="az-num">{money(group.value)}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="cd-glass">
          <div className="cd-head">
            <h3>Sized households</h3>
            <span className="r">estimateFor · not booked</span>
          </div>
          <div style={{ padding: "4px 16px 12px" }}>
            {estimates.map(({ lead, est }) => (
              <button
                key={lead.id}
                type="button"
                className="cd-row"
                style={{ width: "100%", background: "none", color: "inherit", textAlign: "left" }}
                onClick={() => {
                  setSelectedLeadId(lead.id);
                  router.push("/investment");
                }}
              >
                <div>
                  <b>{lead.name}</b>
                  <div className="cd-mono">
                    {est.systemKw} kW · {est.offset}% offset
                  </div>
                </div>
                <b className="az-num">{money(est.netPrice)}</b>
              </button>
            ))}
            {estimates.length === 0 ? <p className="cd-mono">No roof models yet.</p> : null}
          </div>
        </section>
      </div>
    </Station>
  );
}

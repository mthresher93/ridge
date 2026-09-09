"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { funnelCounts, shipmentMargin } from "@/lib/freight";
import { money } from "@/lib/format";

export function AnalyticsView() {
  const router = useRouter();
  const { workspace, loading } = useWorkspace();
  const [source, setSource] = useState("all");
  const [state, setState] = useState("all");
  const [freightType, setFreightType] = useState("all");

  const leads = useMemo(() => {
    return workspace.leads.filter((lead) => {
      if (lead.archivedAt) return false;
      if (source !== "all" && lead.source !== source) return false;
      if (state !== "all" && lead.state !== state) return false;
      if (freightType !== "all" && lead.freightType !== freightType) return false;
      return true;
    });
  }, [workspace.leads, source, state, freightType]);

  const scoped = useMemo(() => {
    const leadIds = new Set(leads.map((item) => item.id));
    return {
      ...workspace,
      leads,
      quotes: (workspace.quotes || []).filter((item) => leadIds.has(item.leadId)),
      shipments: (workspace.shipments || []).filter((item) => leadIds.has(item.leadId)),
      kpiEvents: workspace.kpiEvents.filter((item) => !item.leadId || leadIds.has(item.leadId)),
    };
  }, [workspace, leads]);

  const funnel = funnelCounts(scoped);
  const shipments = scoped.shipments || [];
  const revenue = shipments.reduce((sum, item) => sum + (Number(item.customerRate) || 0), 0);
  const cost = shipments.reduce((sum, item) => sum + (Number(item.carrierRate) || 0), 0);
  const margin = revenue - cost;
  const contacted = funnel.contacted;
  const responseRate = contacted ? Math.round((funnel.replied / contacted) * 100) : 0;
  const closeRate = funnel.quotes ? Math.round((funnel.won / funnel.quotes) * 100) : 0;
  const repeat = leads.filter((lead) => lead.status === "Recurring Account").length;
  const events = scoped.kpiEvents || [];
  const counted = (type: string) => events.filter((event) => event.type === type).length;

  const bySource = useMemo(() => {
    const map = new Map<string, { n: number; contacted: number; replies: number; quotes: number; loads: number; margin: number }>();
    for (const lead of leads) {
      const row = map.get(lead.source) || { n: 0, contacted: 0, replies: 0, quotes: 0, loads: 0, margin: 0 };
      row.n += 1;
      if (lead.lastContactAt || lead.attempts > 0) row.contacted += 1;
      if (["Replied", "Qualified", "Contact Info Obtained", "Quote Requested", "Quote Sent", "Negotiating", "Load Won", "Recurring Account"].includes(lead.status)) row.replies += 1;
      if (/Quote|Negotiating|Load Won|Recurring/.test(lead.status)) row.quotes += 1;
      if (lead.status === "Load Won" || lead.status === "Recurring Account") row.loads += 1;
      map.set(lead.source, row);
    }
    for (const ship of shipments) {
      const lead = leads.find((item) => item.id === ship.leadId);
      if (!lead) continue;
      const row = map.get(lead.source) || { n: 0, contacted: 0, replies: 0, quotes: 0, loads: 0, margin: 0 };
      row.margin += shipmentMargin(ship.customerRate, ship.carrierRate);
      map.set(lead.source, row);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].n - a[1].n);
  }, [leads, shipments]);

  const sources = Array.from(new Set(workspace.leads.map((item) => item.source).filter(Boolean)));
  const states = Array.from(new Set(workspace.leads.map((item) => item.state).filter((item): item is string => Boolean(item))));
  const types = Array.from(new Set(workspace.leads.map((item) => item.freightType).filter((item): item is NonNullable<typeof item> => Boolean(item))));

  if (loading) return <div className="cd-body text-[var(--tx4)]">Reading recorded activity…</div>;

  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>Analytics</h1>
          <p>Counts come from saved clients, quotes, and shipments — not projections.</p>
        </div>
      </header>
      <div className="desk-body">
        {workspace.leads.filter((lead) => !lead.archivedAt).length === 0 ? (
          <section className="empty-desk">
            <h2>No recorded activity yet</h2>
            <p>Counts here only come from clients you capture, messages you send, and rates you type. Nothing is projected.</p>
            <div className="empty-desk-actions">
              <button className="az-btn pri sm" type="button" onClick={() => router.push("/discover")}>
                Hunt a listing
              </button>
            </div>
          </section>
        ) : (
          <>
        <div className="crm-desk-tools">
          <select className="az-select" value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">All sources</option>
            {sources.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select className="az-select" value={state} onChange={(event) => setState(event.target.value)}>
            <option value="all">All states</option>
            {states.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select className="az-select" value={freightType} onChange={(event) => setFreightType(event.target.value)}>
            <option value="all">All freight types</option>
            {types.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        <section className="freight-funnel" aria-label="Sales funnel">
          {[
            ["Clients", funnel.discovered],
            ["Contacted", funnel.contacted],
            ["Replied", funnel.replied],
            ["Qualified", funnel.qualified],
            ["Quotes", funnel.quotes],
            ["Loads", funnel.won],
          ].map(([label, value], index) => (
            <div key={label} className="freight-funnel-step">
              {index ? <span className="freight-funnel-arrow">→</span> : null}
              <div>
                <b>{value}</b>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </section>
        <p className="cd-mono" style={{ margin: "12px 0 18px" }}>
          {funnel.discovered} clients → {funnel.contacted} contacted → {funnel.replied} replies → {funnel.qualified} qualified → {funnel.quotes} quotes → {funnel.won} loads → {money(margin)} gross margin
        </p>
        <div className="metric-strip" style={{ marginBottom: 16 }}>
          <div className="ms-cell">
            <div className="ms-l">Response</div>
            <div className="ms-v">{responseRate}%</div>
            <div className="ms-d">replies / contacted</div>
          </div>
          <div className="ms-cell">
            <div className="ms-l">Close</div>
            <div className="ms-v">{closeRate}%</div>
            <div className="ms-d">loads / quotes</div>
          </div>
          <div className="ms-cell">
            <div className="ms-l">Revenue</div>
            <div className="ms-v">{money(revenue)}</div>
            <div className="ms-d">customer rates</div>
          </div>
          <div className="ms-cell">
            <div className="ms-l">Carrier cost</div>
            <div className="ms-v">{money(cost)}</div>
            <div className="ms-d">recorded carrier rates</div>
          </div>
          <div className="ms-cell">
            <div className="ms-l">Margin / load</div>
            <div className="ms-v">{shipments.length ? money(Math.round(margin / shipments.length)) : "—"}</div>
            <div className="ms-d">{repeat} repeat shippers</div>
          </div>
        </div>
        <p className="cd-mono" style={{ margin: "0 0 16px" }}>
          Recorded events: {counted("quote_accepted")} quotes accepted · {counted("load_booked")} loads booked · {counted("delivery")} deliveries · {counted("pod_received")} PODs. Nothing else is inferred.
        </p>
        <section className="az-panel freight-panel">
          <header>
            <h3>Lead source performance</h3>
          </header>
          <table className="az-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Clients</th>
                <th>Contacted</th>
                <th>Replies</th>
                <th>Quotes</th>
                <th>Loads</th>
                <th>Margin</th>
              </tr>
            </thead>
            <tbody>
              {bySource.map(([name, row]) => (
                <tr key={name} className="cursor-default">
                  <td>{name}</td>
                  <td className="az-num">{row.n}</td>
                  <td className="az-num">{row.contacted}</td>
                  <td className="az-num">{row.replies}</td>
                  <td className="az-num">{row.quotes}</td>
                  <td className="az-num">{row.loads}</td>
                  <td className="az-num">{money(row.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
          </>
        )}
      </div>
    </div>
  );
}

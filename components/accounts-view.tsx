"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { companyName, isAccountLead, leadLocation, shipmentMargin, summarizeProspect } from "@/lib/freight";
import { formatWhen, money } from "@/lib/format";

export function AccountsView() {
  const router = useRouter();
  const { workspace, loading, setSelectedLeadId } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const accounts = useMemo(
    () => workspace.leads.filter((lead) => isAccountLead(lead, workspace)),
    [workspace],
  );
  const selected = accounts.find((item) => item.id === selectedId) || accounts[0] || null;

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading accounts…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Accounts</h1>
            <p>{accounts.length} shippers with won loads or recurring status</p>
          </div>
        </header>
        <div className="accounts-grid">
          <section className="az-panel overflow-auto">
            {accounts.length === 0 ? <p className="rec-empty">Win a load or mark a client Recurring Account.</p> : null}
            {accounts.map((lead) => {
              const ships = (workspace.shipments || []).filter((item) => item.leadId === lead.id);
              const margin = ships.reduce((sum, item) => sum + shipmentMargin(item.customerRate, item.carrierRate), 0);
              return (
                <button key={lead.id} type="button" className={`work-row text-left ${selected?.id === lead.id ? "on" : ""}`} onClick={() => setSelectedId(lead.id)}>
                  <div>
                    <b>{companyName(lead)}</b>
                    <div className="cd-mono">
                      {leadLocation(lead) || "—"} · {ships.length} loads
                    </div>
                  </div>
                  <span className="az-num">{money(margin)}</span>
                </button>
              );
            })}
          </section>
          {selected ? (
            <AccountDetail
              leadId={selected.id}
              onOpen={() => {
                setSelectedLeadId(selected.id);
                router.push(`/people?id=${selected.id}`);
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AccountDetail({ leadId, onOpen }: { leadId: string; onOpen: () => void }) {
  const { workspace } = useWorkspace();
  const lead = workspace.leads.find((item) => item.id === leadId);
  if (!lead) return null;
  const ships = (workspace.shipments || []).filter((item) => item.leadId === lead.id);
  const revenue = ships.reduce((sum, item) => sum + (Number(item.customerRate) || 0), 0);
  const cost = ships.reduce((sum, item) => sum + (Number(item.carrierRate) || 0), 0);
  const margin = revenue - cost;
  const last = [...ships].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const origins = Array.from(new Set(ships.map((item) => item.origin).filter(Boolean)));
  const dests = Array.from(new Set(ships.map((item) => item.destination).filter(Boolean)));
  const equipment = Array.from(new Set(ships.map((item) => item.equipmentType).filter(Boolean)));

  return (
    <section className="az-panel freight-panel">
      <header>
        <h3>{companyName(lead)}</h3>
        <button className="az-btn sm" type="button" onClick={onOpen}>
          Open client
        </button>
      </header>
      <p>{summarizeProspect(workspace, lead)}</p>
      <div className="freight-intel-grid">
        <div>
          <span>Revenue</span>
          <b>{money(revenue)}</b>
        </div>
        <div>
          <span>Gross margin</span>
          <b>{money(margin)}</b>
        </div>
        <div>
          <span>Avg / load</span>
          <b>{ships.length ? money(Math.round(margin / ships.length)) : "—"}</b>
        </div>
      </div>
      <p className="cd-mono">
        Origins: {origins.join(", ") || "—"} · Destinations: {dests.join(", ") || "—"} · Equipment: {equipment.join(", ") || "—"}
      </p>
      <p className="cd-mono">Last shipment: {last ? `${last.status} · ${formatWhen(last.updatedAt)}` : "None"}</p>
      <h3>Shipment history</h3>
      {ships.length === 0 ? <p className="rec-empty">No shipments booked yet.</p> : null}
      {ships.map((item) => (
        <div key={item.id} className="rec-row">
          <b>{item.status}</b>
          <p>
            {item.origin} → {item.destination} · {item.commodity} · {money(shipmentMargin(item.customerRate, item.carrierRate))}
          </p>
        </div>
      ))}
    </section>
  );
}

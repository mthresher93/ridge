"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { carrierLabel } from "@/lib/carriers";
import { carrierVerified, setVetCheck, VET_CHECKS } from "@/lib/ops";
import type { VetState } from "@/lib/types";

export function CarriersView() {
  const { workspace, setWorkspace, loading } = useWorkspace();
  const rows = workspace.carriers || [];
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id || null);
  const selected = useMemo(() => rows.find((item) => item.id === selectedId) || rows[0] || null, [rows, selectedId]);

  function setCheck(checkId: string, state: VetState) {
    if (!selected) return;
    setWorkspace((prev) => {
      const result = setVetCheck(prev, selected.id, checkId, state);
      return result.ok ? result.workspace : prev;
    });
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading carriers…</div>;

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Carriers</h1>
            <p>
              {rows.length === 0
                ? "Paste an FMCSA snapshot or carrier site on Shipments. A file is not a verified carrier."
                : `${rows.length} on file. Verified only after MC, DOT, authority, and insurance are marked pass.`}
            </p>
          </div>
        </header>
        <div className="carrier-desk">
          <div className="az-panel overflow-auto min-h-0 crm-table-wrap">
            {rows.length === 0 ? (
              <p className="cd-mono" style={{ padding: 16 }}>
                No carriers yet.
              </p>
            ) : (
              <table className="az-table min-w-[720px]">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>MC</th>
                    <th>DOT</th>
                    <th>Phone</th>
                    <th>Vetting</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.id} className={item.id === selected?.id ? "on" : ""} onClick={() => setSelectedId(item.id)}>
                      <td>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-[12px] text-[var(--muted)]">{item.equipment || "—"}</div>
                      </td>
                      <td>{item.mc || "—"}</td>
                      <td>{item.dot || "—"}</td>
                      <td>{item.phone || "—"}</td>
                      <td>{carrierVerified(item) ? "MC/DOT/authority/insurance passed" : "Not verified"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {selected ? (
            <aside className="az-panel freight-panel">
              <header>
                <div>
                  <div className="home-kicker">Vetting checklist</div>
                  <h3>{selected.name}</h3>
                </div>
              </header>
              <p className="cd-mono">{carrierLabel(selected)}</p>
              <p className="cd-mono">Pass is a human check, not a field being filled in. FMCSA is not connected.</p>
              <div className="vet-list">
                {VET_CHECKS.map((check) => {
                  const row = (selected.vetting || []).find((item) => item.id === check.id);
                  const state = row?.state || "unchecked";
                  return (
                    <div key={check.id} className="vet-row">
                      <span>{check.label}</span>
                      <select
                        className="az-select"
                        value={state}
                        onChange={(event) => setCheck(check.id, event.target.value as VetState)}
                      >
                        <option value="unchecked">Not checked</option>
                        <option value="pass">Pass</option>
                        <option value="warn">Warning</option>
                        <option value="fail">Fail</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

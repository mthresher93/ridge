"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { STAGES } from "@/lib/stages";
import { nowIso } from "@/lib/format";
import type { Opportunity } from "@/lib/types";

export function DealDrawer({ opportunity, onClose }: { opportunity: Opportunity; onClose: () => void }) {
  const { workspace, setWorkspace, log } = useWorkspace();
  const lead = workspace.leads.find((item) => item.id === opportunity.leadId);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const stage = String(data.get("stage") || opportunity.stage);
    setWorkspace((prev) => ({
      ...prev,
      opportunities: prev.opportunities.map((item) => {
        if (item.id !== opportunity.id) return item;
        const changed = item.stage !== stage;
        return {
          ...item,
          name: String(data.get("name") || item.name),
          property: String(data.get("property") || ""),
          stage,
          value: Number(data.get("value")) || 0,
          probability: Math.min(100, Math.max(0, Number(data.get("probability")) || 0)),
          owner: String(data.get("owner") || ""),
          nextAction: String(data.get("nextAction") || ""),
          expectedClose: String(data.get("expectedClose") || ""),
          notes: String(data.get("notes") || ""),
          updatedAt: nowIso(),
          stageEnteredAt: changed ? nowIso() : item.stageEnteredAt,
          history: changed ? [{ from: item.stage, to: stage, at: nowIso(), source: "drawer" }, ...item.history] : item.history,
        };
      }),
      leads: prev.leads.map((item) =>
        item.id === opportunity.leadId ? { ...item, status: stage, updatedAt: nowIso() } : item,
      ),
      updatedAt: nowIso(),
    }));
    log("opportunity", opportunity.id, "updated", "Deal saved");
    onClose();
  }

  return (
    <div className="az-overlay" onClick={onClose}>
      <aside className="az-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <div className="az-kicker">Deal</div>
            <h2 className="text-[24px] tracking-tight mt-1">{opportunity.name}</h2>
            <p className="text-[12px] text-[var(--muted)] mt-1">
              {lead ? `${lead.city} · ${lead.utility}` : "Unlinked rooftop"}
            </p>
          </div>
          <button className="az-btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <form className="space-y-3" onSubmit={save}>
          <Field label="Homeowner" name="name" defaultValue={opportunity.name} />
          <Field label="Property" name="property" defaultValue={opportunity.property} />
          <label className="block text-[12px] text-[var(--muted)]">
            Stage
            <select name="stage" defaultValue={opportunity.stage} className="az-select mt-1">
              {STAGES.map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Value" name="value" type="number" defaultValue={String(opportunity.value)} />
            <Field label="Probability %" name="probability" type="number" defaultValue={String(opportunity.probability)} />
          </div>
          <Field label="Owner" name="owner" defaultValue={opportunity.owner} />
          <Field label="Next action" name="nextAction" defaultValue={opportunity.nextAction} />
          <Field label="Expected close" name="expectedClose" type="date" defaultValue={opportunity.expectedClose} />
          <label className="block text-[12px] text-[var(--muted)]">
            Notes
            <textarea name="notes" className="az-area mt-1" defaultValue={opportunity.notes} />
          </label>
          <button className="az-btn pri w-full">Save deal</button>
        </form>
      </aside>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <label className="block text-[12px] text-[var(--muted)]">
      {label}
      <input name={name} type={type} defaultValue={defaultValue} className="az-input mt-1" />
    </label>
  );
}

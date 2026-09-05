"use client";

import { useWorkspace } from "@/lib/workspace-context";
import { STAGES } from "@/lib/stages";
import { leadEligibility, nowIso } from "@/lib/format";
import { cascadeDeleteLead } from "@/lib/crm";
import type { Consent, Lead, Priority } from "@/lib/types";

export function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { workspace, setWorkspace, log } = useWorkspace();
  const eligibility = leadEligibility(lead);
  const timeline = workspace.activities.filter((item) => item.entityId === lead.id).slice(0, 10);

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const status = String(data.get("status") || lead.status);
    setWorkspace((prev) => ({
      ...prev,
      leads: prev.leads.map((item) =>
        item.id === lead.id
          ? {
              ...item,
              name: String(data.get("name") || item.name),
              property: String(data.get("property") || ""),
              phone: String(data.get("phone") || ""),
              email: String(data.get("email") || ""),
              city: String(data.get("city") || ""),
              utility: String(data.get("utility") || ""),
              monthlyBill: Number(data.get("monthlyBill")) || null,
              status,
              priority: String(data.get("priority") || item.priority) as Priority,
              owner: String(data.get("owner") || ""),
              source: String(data.get("source") || ""),
              consent: String(data.get("consent") || item.consent) as Consent,
              dnc: data.get("dnc") === "on",
              nextAction: String(data.get("nextAction") || ""),
              notes: String(data.get("notes") || ""),
              estimatedValue: Number(data.get("estimatedValue")) || 0,
              updatedAt: nowIso(),
            }
          : item,
      ),
      opportunities: prev.opportunities.map((item) =>
        item.leadId === lead.id ? { ...item, stage: status, name: String(data.get("name") || item.name), updatedAt: nowIso() } : item,
      ),
      updatedAt: nowIso(),
    }));
    log("lead", lead.id, "updated", "Contact saved");
    onClose();
  }

  function remove() {
    if (!confirm("Delete this contact and linked deals, follow-ups, appointments, designs, and call logs?")) return;
    setWorkspace((prev) => cascadeDeleteLead(prev, lead.id));
    log("lead", lead.id, "deleted", "Lead and linked records deleted");
    onClose();
  }

  return (
    <div className="az-overlay" onClick={onClose}>
      <aside className="az-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <div className="az-kicker">Contact</div>
            <h2 className="text-[24px] tracking-tight mt-1">{lead.name}</h2>
            <div className="mt-2">
              <span className={`az-chip ${eligibility.tone}`}>{eligibility.label}</span>
            </div>
          </div>
          <button className="az-btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <form className="space-y-3" onSubmit={save}>
          <Field label="Name" name="name" defaultValue={lead.name} />
          <Field label="Property" name="property" defaultValue={lead.property} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone E.164" name="phone" defaultValue={lead.phone} />
            <Field label="Email" name="email" defaultValue={lead.email} type="email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" name="city" defaultValue={lead.city} />
            <Field label="Utility" name="utility" defaultValue={lead.utility} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly bill" name="monthlyBill" type="number" defaultValue={lead.monthlyBill ? String(lead.monthlyBill) : ""} />
            <Field label="Est. system" name="estimatedValue" type="number" defaultValue={String(lead.estimatedValue)} />
          </div>
          <label className="block text-[12px] text-[var(--muted)]">
            Stage
            <select name="status" defaultValue={lead.status} className="az-select mt-1">
              {STAGES.map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12px] text-[var(--muted)]">
              Priority
              <select name="priority" defaultValue={lead.priority} className="az-select mt-1">
                {["Low", "Medium", "High", "Critical"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="block text-[12px] text-[var(--muted)]">
              Consent
              <select name="consent" defaultValue={lead.consent} className="az-select mt-1">
                <option value="verified">verified</option>
                <option value="unknown">unknown</option>
                <option value="missing">missing</option>
              </select>
            </label>
          </div>
          <Field label="Owner" name="owner" defaultValue={lead.owner} />
          <Field label="Source" name="source" defaultValue={lead.source} />
          <Field label="Next action" name="nextAction" defaultValue={lead.nextAction} />
          <label className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
            <input type="checkbox" name="dnc" defaultChecked={lead.dnc} />
            Internal DNC
          </label>
          <label className="block text-[12px] text-[var(--muted)]">
            Notes
            <textarea name="notes" className="az-area mt-1" defaultValue={lead.notes} />
          </label>
          <div className="flex gap-2">
            <button className="az-btn pri flex-1">Save</button>
            <button type="button" className="az-btn danger" onClick={remove}>
              Delete
            </button>
          </div>
        </form>
        <section className="mt-8">
          <div className="az-kicker mb-3">Activity</div>
          {timeline.length === 0 ? (
            <div className="text-[var(--muted)] text-[13px]">No recorded activity.</div>
          ) : (
            timeline.map((item) => (
              <div key={item.id} className="py-2 border-b border-[var(--line)]">
                <div className="text-[13px]">{item.detail}</div>
                <div className="text-[11px] text-[var(--faint)] font-mono">{new Date(item.at).toLocaleString()}</div>
              </div>
            ))
          )}
        </section>
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

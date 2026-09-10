"use client";

import { useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { nowIso } from "@/lib/format";
import { runStudio, STUDIO_TOOLS, type StudioToolId } from "@/lib/studio";

export function StudioView() {
  const { workspace, setWorkspace, log, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const [tool, setTool] = useState<StudioToolId>("talk");
  const [approval, setApproval] = useState<"draft" | "approved" | "rejected">("draft");
  const [saved, setSaved] = useState("");
  const lead = workspace.leads.find((item) => item.id === selectedLeadId) || workspace.leads[0] || null;
  const design = lead ? workspace.designs?.[lead.id] : null;
  const output = useMemo(() => runStudio(tool, workspace, lead, design), [tool, workspace, lead, design]);

  function attach() {
    if (!lead || approval !== "approved") return;
    setWorkspace((prev) => ({
      ...prev,
      leads: prev.leads.map((item) =>
        item.id === lead.id ? { ...item, notes: [item.notes, `[Studio ${tool}] ${output.body}`].filter(Boolean).join("\n\n"), updatedAt: nowIso() } : item,
      ),
      updatedAt: nowIso(),
    }));
    log("lead", lead.id, "studio_attach", `Attached ${tool}`);
    setSaved("Attached to lead note.");
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Opening studio…</div>;

  return (
    <div className="cd-page fill">
      <header className="crm-desk-head">
        <div>
          <h1>Studio</h1>
          <p>{approval === "approved" ? "Approved · attach locally" : "Draft · review before attach"}</p>
        </div>
      </header>
      <div className="desk-body fill">
      <div className="studio-grid">
        <aside>
          {STUDIO_TOOLS.map((item) => (
            <button key={item.id} type="button" className={`studio-tool ${tool === item.id ? "on" : ""}`} onClick={() => setTool(item.id)}>
              <b>{item.label}</b>
              <p className="cd-mono" style={{ marginTop: 4, textTransform: "none", letterSpacing: 0 }}>
                {item.blurb}
              </p>
            </button>
          ))}
        </aside>
        <section className="cd-glass" style={{ padding: 16 }}>
          <div className="studio-bar">
            <select className="az-select" value={lead?.id || ""} onChange={(e) => setSelectedLeadId(e.target.value || null)}>
              <option value="">No lead context</option>
              {workspace.leads.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.city}
                </option>
              ))}
            </select>
            <select className="az-select" value={approval} onChange={(e) => setApproval(e.target.value as typeof approval)}>
              <option value="draft">Draft · review required</option>
              <option value="approved">Approved for local attach</option>
              <option value="rejected">Rejected</option>
            </select>
            <button
              className="az-btn"
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(output.body);
                setSaved("Copied.");
              }}
            >
              Copy
            </button>
            <button className="az-btn pri" type="button" onClick={attach} disabled={approval !== "approved" || !lead}>
              Attach to lead
            </button>
          </div>
          <div className="cd-mono" style={{ color: "var(--vi)", margin: "14px 0 8px" }}>
            {output.title}
          </div>
          <pre className="studio-out">{output.body}</pre>
          <p className="cd-mono" style={{ marginTop: 12 }}>
            {output.gate}
            {saved ? ` · ${saved}` : ""}
          </p>
        </section>
      </div>
      </div>
    </div>
  );
}

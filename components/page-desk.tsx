"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { ScriptPanel } from "./script-panel";

export function PageDesk({ children, script = true }: { children: React.ReactNode; script?: boolean }) {
  const { workspace, selectedLeadId } = useWorkspace();
  const [beat, setBeat] = useState(0);
  const lead = workspace.leads.find((item) => item.id === selectedLeadId) || workspace.leads[0] || null;
  const design = lead ? workspace.designs?.[lead.id] : null;

  useEffect(() => {
    setBeat(0);
  }, [lead?.id]);

  return (
    <div className={`page-desk ${script ? "" : "solo"}`.trim()}>
      <div className="page-desk-body">{children}</div>
      {script ? <ScriptPanel lead={lead} design={design} beat={beat} onBeat={setBeat} /> : null}
    </div>
  );
}

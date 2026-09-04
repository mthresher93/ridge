"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { ScriptPanel } from "./script-panel";

export function PageDesk({ children }: { children: React.ReactNode }) {
  const { workspace, selectedLeadId } = useWorkspace();
  const [beat, setBeat] = useState(0);
  const lead = workspace.leads.find((item) => item.id === selectedLeadId) || workspace.leads[0] || null;
  const design = lead ? workspace.designs?.[lead.id] : null;

  useEffect(() => {
    setBeat(0);
  }, [lead?.id]);

  return (
    <div className="page-desk">
      <div className="page-desk-body">{children}</div>
      <ScriptPanel lead={lead} design={design} beat={beat} onBeat={setBeat} />
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { integrationStatus } from "@/lib/integration-status";
import { StatusPill } from "./status-pill";

export function PageHeader({
  title,
  subtitle,
  statusLabel,
  controls,
  filters,
}: {
  title: string;
  subtitle: string;
  statusLabel?: string;
  controls?: ReactNode;
  filters?: ReactNode;
}) {
  const { workspace } = useWorkspace();
  const honest = integrationStatus(workspace);

  return (
    <header className="crm-page-head">
      <div className="crm-page-head-row">
        <div className="crm-page-head-copy">
          <h1 className="font-display">{title}</h1>
          <p>{subtitle}</p>
          <StatusPill status={honest.status} label={statusLabel || honest.label} title={honest.detail} />
        </div>
        {controls ? <div className="crm-page-head-controls">{controls}</div> : null}
      </div>
      {filters ? <div className="crm-filter-strip">{filters}</div> : null}
    </header>
  );
}

"use client";

import { Shell } from "@/components/shell";
import { WorkspaceProvider } from "@/lib/workspace-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}

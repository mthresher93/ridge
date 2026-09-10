"use client";

import { usePathname } from "next/navigation";
import { Shell } from "@/components/shell";
import { AppErrorBoundary } from "@/components/error-boundary";
import { WorkspaceProvider } from "@/lib/workspace-context";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = pathname === "/login";
  return (
    <WorkspaceProvider>
      {bare ? children : (
        <AppErrorBoundary>
          <Shell>{children}</Shell>
        </AppErrorBoundary>
      )}
    </WorkspaceProvider>
  );
}

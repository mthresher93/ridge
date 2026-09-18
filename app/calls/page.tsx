"use client";

import { Suspense } from "react";
import { OutreachView } from "@/components/outreach-view";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-[var(--vx-text-3)]">Loading calls…</div>}>
      <OutreachView />
    </Suspense>
  );
}

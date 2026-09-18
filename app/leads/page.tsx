"use client";

import { Suspense } from "react";
import { PeopleView } from "@/components/people-view";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-[var(--vx-text-3)]">Loading leads…</div>}>
      <PeopleView />
    </Suspense>
  );
}

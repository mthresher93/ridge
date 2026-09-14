"use client";

import { Suspense } from "react";
import { PeopleView } from "@/components/people-view";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-[var(--muted)]">Loading prospects…</div>}>
      <PeopleView />
    </Suspense>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { NAV } from "@/lib/nav";
import { phonePretty } from "@/lib/format";

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = NAV.filter((item) => !q || item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q)).map(
      (item) => ({
        id: item.href,
        title: item.label,
        detail: item.hint,
        href: item.href,
      }),
    );
    const people = workspace.leads
      .filter((lead) => {
        if (!q) return false;
        return [lead.name, lead.property, lead.city, lead.phone, lead.email, lead.status].join(" ").toLowerCase().includes(q);
      })
      .slice(0, 8)
      .map((lead) => ({
        id: lead.id,
        title: lead.name,
        detail: `${lead.property} · ${phonePretty(lead.phone)} · ${lead.status}`,
        href: `/people?id=${lead.id}`,
      }));
    return [...(q ? [] : pages), ...people, ...(q ? pages : [])];
  }, [query, workspace.leads]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="az-palette" onClick={onClose}>
      <div className="az-palette-card" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          className="az-input border-0 rounded-none h-14 px-5 text-[16px]"
          placeholder="Jump to a page or find a person"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-[360px] overflow-auto py-2">
          {results.length === 0 ? (
            <div className="px-5 py-8 text-[var(--muted)]">Nothing matches.</div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                className="w-full text-left px-5 py-3 hover:bg-[var(--hover)] flex items-baseline justify-between gap-4"
                onClick={() => {
                  router.push(item.href);
                  onClose();
                }}
              >
                <span>{item.title}</span>
                <span className="text-[12px] text-[var(--muted)] truncate">{item.detail}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

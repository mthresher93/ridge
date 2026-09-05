"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { NAV } from "@/lib/nav";
import { phonePretty } from "@/lib/format";

type Result = {
  id: string;
  title: string;
  detail: string;
  run: () => void;
};

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { workspace, setSelectedLeadId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages: Result[] = NAV.filter((item) => !q || item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q)).map(
      (item) => ({
        id: `page-${item.href}`,
        title: item.label,
        detail: item.hint,
        run: () => router.push(item.href),
      }),
    );
    const people: Result[] = [];
    for (const lead of workspace.leads) {
      if (!q) break;
      const hay = [lead.name, lead.property, lead.city, lead.phone, lead.email, lead.status].join(" ").toLowerCase();
      if (!hay.includes(q)) continue;
      const open = (href: string) => {
        setSelectedLeadId(lead.id);
        router.push(href);
      };
      people.push(
        { id: `${lead.id}-dial`, title: `${lead.name} · Dialer`, detail: `${lead.property} · ${phonePretty(lead.phone)}`, run: () => open("/floor") },
        { id: `${lead.id}-design`, title: `${lead.name} · Design`, detail: lead.city || lead.status, run: () => open("/design") },
        { id: `${lead.id}-map`, title: `${lead.name} · Map`, detail: lead.status, run: () => open("/map") },
        { id: `${lead.id}-record`, title: `${lead.name} · Contact`, detail: lead.status, run: () => open(`/people?id=${lead.id}`) },
      );
      if (people.length >= 16) break;
    }
    return [...(q ? people : []), ...(q ? pages : pages)];
  }, [query, workspace.leads, router, setSelectedLeadId]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((n) => Math.min(results.length - 1, n + 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((n) => Math.max(0, n - 1));
      }
      if (event.key === "Enter" && results[active]) {
        event.preventDefault();
        results[active].run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, results, active]);

  return (
    <div className="az-palette" onClick={onClose}>
      <div className="az-palette-card" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          className="az-input border-0 rounded-none h-14 px-5 text-[16px]"
          placeholder="Jump to a page or open Dialer / Design / Map for a person"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-[360px] overflow-auto py-2">
          {results.length === 0 ? (
            <div className="px-5 py-8 text-[var(--muted)]">Nothing matches.</div>
          ) : (
            results.map((item, index) => (
              <button
                key={item.id}
                className={`w-full text-left px-5 py-3 hover:bg-[var(--hover)] flex items-baseline justify-between gap-4 ${index === active ? "bg-[var(--hover)]" : ""}`}
                onClick={() => {
                  item.run();
                  onClose();
                }}
                onMouseEnter={() => setActive(index)}
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { NAV, workPath } from "@/lib/nav";

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
    const pages: Result[] = NAV.filter((item) => !q || item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q)).map(
      (item) => ({
        id: `page-${item.href}`,
        title: item.label,
        detail: "Open",
        run: () => router.push(item.href),
      }),
    );
    const actions: Result[] = [
      { id: "act-quote", title: "New Quote", detail: "Open Work", run: () => router.push("/outreach") },
      { id: "act-next", title: "Call next prospect", detail: "Dashboard", run: () => router.push("/") },
      { id: "act-hunt", title: "Add prospect", detail: "Discover", run: () => router.push("/discover") },
      { id: "act-load", title: "New Load", detail: "Shipments", run: () => router.push("/shipments") },
      { id: "act-carrier", title: "Search Carrier", detail: "Carriers", run: () => router.push("/carriers") },
    ].filter((item) => !q || item.title.toLowerCase().includes(q));
    const people: Result[] = [];
    for (const lead of workspace.leads) {
      if (!q) break;
      const hay = [lead.name, lead.label, lead.property, lead.city, lead.phone, lead.email, lead.status].join(" ").toLowerCase();
      if (!hay.includes(q)) continue;
      const open = (href: string) => {
        setSelectedLeadId(lead.id);
        router.push(href);
      };
      people.push(
        { id: `${lead.id}-outreach`, title: `${lead.name} · Work`, detail: `${lead.property} · score ${lead.freightScore ?? "—"}`, run: () => open(workPath(lead.id)) },
        { id: `${lead.id}-record`, title: `${lead.name} · Client`, detail: lead.label ? `${lead.label} · ${lead.status}` : lead.status, run: () => open(`/people?id=${lead.id}`) },
      );
      if (people.length >= 16) break;
    }
    const loads: Result[] = [];
    for (const row of workspace.shipments || []) {
      if (!q) break;
      const hay = [row.loadNumber, row.customer, row.origin, row.destination, row.commodity, row.carrier, row.reference].join(" ").toLowerCase();
      if (!hay.includes(q)) continue;
      loads.push({
        id: `shp-${row.id}`,
        title: `${row.loadNumber || "Quote"} · ${row.customer}`,
        detail: `${row.status} · ${row.origin} → ${row.destination}`,
        run: () => router.push(`/shipments?id=${encodeURIComponent(row.id)}`),
      });
      if (loads.length >= 8) break;
    }
    const carriers: Result[] = [];
    for (const row of workspace.carriers || []) {
      if (!q) break;
      const hay = [row.name, row.mc, row.dot, row.phone, row.equipment].join(" ").toLowerCase();
      if (!hay.includes(q)) continue;
      carriers.push({
        id: `cr-${row.id}`,
        title: row.name,
        detail: [row.mc && `MC ${row.mc}`, row.dot && `DOT ${row.dot}`].filter(Boolean).join(" · ") || "Carrier",
        run: () => router.push("/carriers"),
      });
      if (carriers.length >= 8) break;
    }
    return [...(q ? people : []), ...(q ? loads : []), ...(q ? carriers : []), ...(q ? actions : actions), ...(q ? pages : pages)];
  }, [query, workspace.leads, workspace.shipments, workspace.carriers, router, setSelectedLeadId]);

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
          placeholder="Search clients, loads, MC, DOT, or pages"
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

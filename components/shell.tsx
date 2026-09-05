"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "./mark";
import { CommandPalette } from "./command-palette";
import { useWorkspace } from "@/lib/workspace-context";
import { derive, floorWindow } from "@/lib/derive";
import { NAV } from "@/lib/nav";
import { settingsWithDefaults } from "@/lib/types";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, loading, saveStatus } = useWorkspace();
  const [now, setNow] = useState(() => new Date());
  const [palette, setPalette] = useState(false);
  const [mode, setMode] = useState<"solo" | "enroll">("solo");

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const metrics = useMemo(() => derive(workspace), [workspace]);
  const prefs = settingsWithDefaults(workspace.settings);
  const floor = floorWindow(now, { start: prefs.dialWindowStart, end: prefs.dialWindowEnd });
  const density = workspace.settings.density || "comfortable";

  return (
    <div className={`az-shell density-${density}`} data-mode={mode} data-accent={prefs.accent}>
      <header className="az-deck">
        <Link href="/" className="az-brand">
          <BrandMark />
          <div>
            <div className="az-brand-name">Lumen</div>
            <div className="az-brand-sub">Solar desk</div>
          </div>
        </Link>

        <button className="cd-search" type="button" onClick={() => setPalette(true)}>
          <span>Search contacts, calls, follow-ups…</span>
          <span className="az-chip">⌘K</span>
        </button>

        <div className="az-deck-right">
          <div className="mode">
            <button type="button" className={`mode-b ${mode === "solo" ? "on" : ""}`} onClick={() => setMode("solo")}>
              Solo
            </button>
            <button type="button" className={`mode-b ${mode === "enroll" ? "on" : ""}`} onClick={() => setMode("enroll")}>
              Field
            </button>
          </div>
          <span className="cd-stat">
            <span className={`livedot ${floor.open ? "" : "off"}`} />
            {loading ? "Syncing" : saveStatus === "error" ? "Save failed" : "Ready"}
          </span>
          <span className="az-num text-[10px] text-[var(--tx4)]">{metrics.open.length} open</span>
          <button className="az-btn pri" onClick={() => router.push("/floor")}>
            Dialer
          </button>
        </div>

        <nav className="az-nav" aria-label="Stations">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <span className="label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="az-page">{children}</div>
      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
    </div>
  );
}

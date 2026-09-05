"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "./mark";
import { CommandPalette } from "./command-palette";
import { useWorkspace } from "@/lib/workspace-context";
import { derive, floorWindow } from "@/lib/derive";
import { NAV } from "@/lib/nav";

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
  const floor = floorWindow(now);
  const density = workspace.settings.density || "comfortable";

  return (
    <div className={`az-shell density-${density}`} data-mode={mode}>
      <header className="az-deck">
        <Link href="/" className="az-brand">
          <BrandMark />
          <div>
            <div className="az-brand-name">Current</div>
            <div className="az-brand-sub">Solar revenue</div>
          </div>
        </Link>

        <button className="cd-search" type="button" onClick={() => setPalette(true)}>
          <span>Search opportunities, proof, actions…</span>
          <span className="az-chip">⌘K</span>
        </button>

        <div className="right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="mode" style={{ display: "flex", gap: 3, padding: 3, border: "1px solid var(--br)", borderRadius: 8, background: "var(--bg2)" }}>
            <button type="button" className={`mode-b ${mode === "solo" ? "on" : ""}`} onClick={() => setMode("solo")}>
              Solo
            </button>
            <button type="button" className={`mode-b ${mode === "enroll" ? "on" : ""}`} onClick={() => setMode("enroll")}>
              Field
            </button>
          </div>
          <span className="cd-stat">
            <span className={`livedot ${floor.open ? "" : "off"}`} />
            {loading ? "SYNCING" : saveStatus === "error" ? "SAVE FAILED" : "LOCAL APP · READY"}
          </span>
          <span className="az-num text-[10px] text-[var(--tx4)]">{metrics.open.length} OPEN</span>
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

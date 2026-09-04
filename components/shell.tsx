"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "./mark";
import { CommandPalette } from "./command-palette";
import { useWorkspace } from "@/lib/workspace-context";
import { derive, floorWindow } from "@/lib/derive";
import { formatClock, moneyShort } from "@/lib/format";
import { NAV } from "@/lib/nav";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, loading, saveStatus } = useWorkspace();
  const [now, setNow] = useState(() => new Date());
  const [palette, setPalette] = useState(false);

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
    <div className={`az-shell density-${density}`}>
      <aside className="az-side">
        <Link href="/" className="az-brand">
          <BrandMark />
          <div>
            <div className="az-brand-name">Ridge</div>
            <div className="az-brand-sub">Solar sales desk</div>
          </div>
        </Link>
        <nav className="az-nav">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <span className="label">{item.label}</span>
                <span className="hint">{item.hint}</span>
              </Link>
            );
          })}
        </nav>
        <div className="az-side-foot">
            <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--faint)]">Open pipeline</div>
          <div className="az-num text-[22px] tracking-tight">{loading ? "—" : moneyShort(metrics.openValue)}</div>
          <div className="text-[12px] text-[var(--muted)] mt-1">
            {metrics.open.length} live deals · {metrics.coverage}% covered
          </div>
        </div>
      </aside>

      <div className="az-main">
        <header className="az-top">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`az-dot ${floor.open ? "" : "off"}`} />
            <div className="min-w-0">
              <div className="text-[13px] text-[var(--text)] truncate">{floor.label}</div>
              <div className="text-[11px] text-[var(--muted)] font-mono">{floor.detail}</div>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <span className={`az-save ${saveStatus}`} title="Workspace save status">
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save failed" : ""}
            </span>
            <div className="hidden sm:block text-right">
              <div className="az-num text-[12px] text-[var(--muted)]">PP {formatClock(now, "Asia/Phnom_Penh")}</div>
              <div className="az-num text-[12px] text-[var(--gold)]">PT {formatClock(now, "America/Los_Angeles")}</div>
            </div>
            <button className="az-btn ghost" onClick={() => setPalette(true)}>
              <span className="text-[var(--muted)]">Search</span>
              <span className="az-chip">⌘K</span>
            </button>
            <button className="az-btn" onClick={() => router.push("/floor")}>
              Open dialer
            </button>
          </div>
        </header>
        <div className="az-page">{children}</div>
      </div>
      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
    </div>
  );
}

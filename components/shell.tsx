"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLockup } from "./mark";
import { CommandPalette } from "./command-palette";
import { useWorkspace } from "@/lib/workspace-context";
import { DESK_NAV, MORE_NAV } from "@/lib/nav";
import { NavIcon, NAV_ICONS } from "./nav-icons";
import { settingsWithDefaults } from "@/lib/types";
import { workPath } from "@/lib/nav";
import { callableUncontacted } from "@/lib/metro";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, loading, loadError, saveStatus, reload, retrySave } = useWorkspace();
  const [palette, setPalette] = useState(false);
  const moreActive = MORE_NAV.some((item) => isActive(pathname, item.href));
  const [moreOpen, setMoreOpen] = useState(moreActive);
  const toCall = callableUncontacted(workspace, 200).length;
  const operator = settingsWithDefaults(workspace.settings).operator || workspace.settings.defaultOwner || "Michael";

  useEffect(() => {
    if (moreActive) setMoreOpen(true);
  }, [moreActive]);

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

  const prefs = settingsWithDefaults(workspace.settings);
  const density = workspace.settings.density || "comfortable";

  return (
    <div className={`az-shell density-${density}`} data-accent={prefs.accent}>
      <Link href="/" className="az-brand" aria-label="Haul">
        <BrandLockup />
      </Link>

      <header className="az-top">
        <button className="cd-search" type="button" onClick={() => setPalette(true)}>
          <span>Search clients…</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="az-top-right">
          {loadError || saveStatus === "error" || saveStatus === "conflict" || saveStatus === "saving" || loading ? (
            <span className="cd-stat">
              <span className={`livedot ${loadError ? "off" : ""}`} />
              {loadError ? "Load failed" : loading ? "Syncing" : saveStatus === "error" ? "Save failed" : saveStatus === "conflict" ? "Reloaded" : "Saving"}
            </span>
          ) : null}
          {saveStatus === "error" ? (
            <button className="az-btn sm" type="button" onClick={() => retrySave()}>
              Retry
            </button>
          ) : null}
          <span className="az-num az-top-open">{toCall} ready</span>
          <span className="az-top-user">{operator}</span>
          <button className="az-btn gold sm" type="button" onClick={() => router.push(workPath())}>
            Next call
          </button>
        </div>
      </header>

      <aside className="az-rail">
        <nav className="az-rail-nav" aria-label="Workspace">
          <div className="az-rail-group">
            {DESK_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "active" : ""}>
                <NavIcon name={NAV_ICONS[item.href]} />
                {item.label}
              </Link>
            ))}
          </div>
          <div className="az-rail-more">
            <button
              type="button"
              className={`az-rail-more-btn${moreActive ? " active" : ""}`}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <NavIcon name="more" />
              More
            </button>
            {moreOpen
              ? MORE_NAV.map((item) => (
                  <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "active" : ""}>
                    <NavIcon name={NAV_ICONS[item.href]} />
                    {item.label}
                  </Link>
                ))
              : null}
          </div>
        </nav>

        <div className="az-rail-foot">
          <Link href="/settings" className={`az-rail-settings${isActive(pathname, "/settings") ? " active" : ""}`}>
            <NavIcon name="settings" />
            Settings
          </Link>
        </div>
      </aside>

      <div className="az-main">
        {loadError ? (
          <div className="az-sync-banner">
            <span>Could not load the workspace. {loadError}</span>
            <button className="az-btn sm" type="button" onClick={() => void reload()}>
              Reload
            </button>
          </div>
        ) : null}
        {saveStatus === "conflict" ? (
          <div className="az-sync-banner">
            <span>Another save landed first. Reloaded the saved copy.</span>
          </div>
        ) : null}
        <div className="az-page">{children}</div>
      </div>
      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
    </div>
  );
}

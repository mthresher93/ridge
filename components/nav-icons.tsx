import type { ReactNode } from "react";

type IconName =
  | "dashboard"
  | "discover"
  | "intel"
  | "clients"
  | "work"
  | "followups"
  | "pipeline"
  | "shipments"
  | "carriers"
  | "more"
  | "accounts"
  | "analytics"
  | "copilot"
  | "settings"
  | "contacts"
  | "companies"
  | "leads"
  | "map"
  | "tasks"
  | "calendar"
  | "calls"
  | "logs"
  | "reports";

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg className="az-rail-ico" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <g fill="none" stroke="#111" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

const ICONS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="0.8" />
      <rect x="10" y="2.5" width="5.5" height="5.5" rx="0.8" />
      <rect x="2.5" y="10" width="5.5" height="5.5" rx="0.8" />
      <rect x="10" y="10" width="5.5" height="5.5" rx="0.8" />
    </>
  ),
  discover: (
    <>
      <circle cx="8" cy="8" r="4.4" />
      <path d="M11.3 11.3 16 16" />
    </>
  ),
  intel: (
    <>
      <path d="M4.5 3.5h7.5a2 2 0 0 1 2 2v9.5H6.5a2 2 0 0 0-2 2v-11.5a2 2 0 0 1 2-2z" />
      <path d="M7 7h5.5M7 10h5.5" />
    </>
  ),
  clients: (
    <>
      <circle cx="7" cy="6" r="2.3" />
      <path d="M2.8 15.2c.5-2.6 2.4-4.2 4.2-4.2s3.7 1.6 4.2 4.2" />
      <circle cx="13.2" cy="7.1" r="1.8" />
      <path d="M12.4 15.2c.3-1.4 1.4-2.7 2.8-3.1" />
    </>
  ),
  work: (
    <>
      <path d="M5.2 3.8h2.4l1 2.6-1.8 1.1c.5 1.3 1.7 2.5 3 3l1.1-1.8 2.6 1v2.5C8.8 13.6 4.4 9.2 5.2 3.8z" />
    </>
  ),
  followups: (
    <>
      <rect x="3" y="3.8" width="12" height="11.5" rx="1.4" />
      <path d="M3 7.2h12M6.2 2.6v2.6M11.8 2.6v2.6M7 11h4" />
    </>
  ),
  pipeline: (
    <>
      <rect x="2.4" y="3.2" width="3.4" height="11.6" rx="0.7" />
      <rect x="7.3" y="3.2" width="3.4" height="11.6" rx="0.7" />
      <rect x="12.2" y="3.2" width="3.4" height="11.6" rx="0.7" />
    </>
  ),
  shipments: (
    <>
      <path d="M2.4 11.2V6.4h8.2v4.8z" />
      <path d="M10.6 8.2h3.2l1.8 3h-5z" />
      <circle cx="5.4" cy="14.2" r="1.35" />
      <circle cx="13.1" cy="14.2" r="1.35" />
    </>
  ),
  carriers: (
    <>
      <path d="M5 14.5 3.4 8.2 9 3.4l5.6 4.8-1.6 6.3z" />
      <path d="M7.1 10.2h3.8" />
    </>
  ),
  more: (
    <>
      <path d="M3.2 5h11.6M3.2 9h11.6M3.2 13h7.4" />
    </>
  ),
  accounts: (
    <>
      <path d="M3.4 15.4V6.2L9 3.2l5.6 3v9.2z" />
      <path d="M7.2 15.4v-4.6h3.6v4.6" />
    </>
  ),
  analytics: (
    <>
      <path d="M2.8 14.6h12.4" />
      <path d="M5.4 12.2V8.2M9 12.2V5.4M12.6 12.2V7.4" />
    </>
  ),
  copilot: (
    <>
      <path d="M9 2.8 10.2 7.2 14.8 8.5 10.2 9.8 9 14.2 7.8 9.8 3.2 8.5 7.8 7.2z" />
    </>
  ),
  settings: (
    <>
      <circle cx="9" cy="9" r="2.4" />
      <path d="M9 2.4v1.8M9 13.8v1.8M2.4 9h1.8M13.8 9h1.8M4.2 4.2l1.3 1.3M12.5 12.5l1.3 1.3M4.2 13.8l1.3-1.3M12.5 5.5l1.3-1.3" />
    </>
  ),
  contacts: (
    <>
      <circle cx="7" cy="6" r="2.3" />
      <path d="M2.8 15.2c.5-2.6 2.4-4.2 4.2-4.2s3.7 1.6 4.2 4.2" />
      <circle cx="13.2" cy="7.1" r="1.8" />
    </>
  ),
  companies: (
    <>
      <path d="M3.4 15.4V6.2L9 3.2l5.6 3v9.2z" />
      <path d="M7.2 15.4v-4.6h3.6v4.6" />
    </>
  ),
  leads: (
    <>
      <circle cx="9" cy="6.2" r="2.4" />
      <path d="M4 15c.6-3 2.4-4.6 5-4.6s4.4 1.6 5 4.6" />
    </>
  ),
  map: (
    <>
      <path d="M3.2 4.4 7.4 3.2 10.8 5l4-1.2v11.6L10.8 14.4 7.4 12.6 3.2 14z" />
      <path d="M7.4 3.2v9.4M10.8 5v9.4" />
    </>
  ),
  tasks: (
    <>
      <rect x="3.2" y="3.4" width="11.6" height="11.4" rx="1.2" />
      <path d="M6 9.2 8 11.2 12.2 7" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="3.8" width="12" height="11.5" rx="1.4" />
      <path d="M3 7.2h12M6.2 2.6v2.6M11.8 2.6v2.6" />
    </>
  ),
  calls: (
    <>
      <path d="M5.2 3.8h2.4l1 2.6-1.8 1.1c.5 1.3 1.7 2.5 3 3l1.1-1.8 2.6 1v2.5C8.8 13.6 4.4 9.2 5.2 3.8z" />
    </>
  ),
  logs: (
    <>
      <path d="M4.5 3.5h9a1.4 1.4 0 0 1 1.4 1.4v8.2H6.2a1.7 1.7 0 0 0-1.7 1.7V4.9A1.4 1.4 0 0 1 4.5 3.5z" />
      <path d="M7 7h5M7 10h4" />
    </>
  ),
  reports: (
    <>
      <path d="M2.8 14.6h12.4" />
      <path d="M5.4 12.2V8.2M9 12.2V5.4M12.6 12.2V7.4" />
    </>
  ),
};

export function NavIcon({ name }: { name?: IconName }) {
  return <Glyph>{ICONS[name || "dashboard"]}</Glyph>;
}

export const NAV_ICONS: Record<string, IconName> = {
  "/": "dashboard",
  "/contacts": "contacts",
  "/companies": "companies",
  "/leads": "leads",
  "/pipeline": "pipeline",
  "/map": "map",
  "/discover": "discover",
  "/tasks": "tasks",
  "/calendar": "calendar",
  "/calls": "calls",
  "/call-logs": "logs",
  "/reports": "reports",
  "/playbook": "intel",
  "/shipments": "shipments",
  "/carriers": "carriers",
  "/people": "clients",
  "/outreach": "work",
  "/callbacks": "followups",
  "/board": "pipeline",
  "/accounts": "accounts",
  "/analytics": "analytics",
  "/copilot": "copilot",
  "/settings": "settings",
};

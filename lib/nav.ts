export type NavItem = { href: string; label: string };

export type NavGroup = { id: string; label: string; items: NavItem[] };

export const SELL_NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/leads", label: "Leads" },
  { href: "/calls", label: "Calls" },
];

export const BOOK_NAV: NavItem[] = [
  { href: "/contacts", label: "Contacts" },
  { href: "/companies", label: "Companies" },
  { href: "/discover", label: "Discover" },
  { href: "/map", label: "Map" },
];

export const OPS_NAV: NavItem[] = [
  { href: "/tasks", label: "Tasks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/call-logs", label: "Logs" },
  { href: "/reports", label: "Reports" },
];

export const DESK_NAV: NavItem[] = [...SELL_NAV, ...BOOK_NAV, ...OPS_NAV];

export function workPath(leadId?: string | null) {
  return leadId ? `/calls?id=${encodeURIComponent(leadId)}` : "/calls";
}

export const MORE_NAV: NavItem[] = [
  { href: "/playbook", label: "Intel" },
  { href: "/shipments", label: "Shipments" },
  { href: "/carriers", label: "Carriers" },
];

export const NAV_GROUPS: NavGroup[] = [
  { id: "sell", label: "Sell", items: SELL_NAV },
  { id: "book", label: "Book", items: BOOK_NAV },
  { id: "ops", label: "Ops", items: OPS_NAV },
];

export const NAV: NavItem[] = [...DESK_NAV, ...MORE_NAV, { href: "/settings", label: "Settings" }];

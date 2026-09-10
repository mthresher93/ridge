export type NavItem = { href: string; label: string };

export type NavGroup = { id: string; label: string; items: NavItem[] };

export const DESK_NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/discover", label: "Discover" },
  { href: "/playbook", label: "Intel" },
  { href: "/people", label: "Clients" },
  { href: "/outreach", label: "Work" },
  { href: "/callbacks", label: "Follow-ups" },
  { href: "/board", label: "Pipeline" },
  { href: "/shipments", label: "Shipments" },
  { href: "/carriers", label: "Carriers" },
];

export function workPath(leadId?: string | null) {
  return leadId ? `/outreach?id=${encodeURIComponent(leadId)}` : "/outreach";
}

export const MORE_NAV: NavItem[] = [
  { href: "/accounts", label: "Accounts" },
  { href: "/analytics", label: "Analytics" },
  { href: "/copilot", label: "AI Copilot" },
];

export const NAV_GROUPS: NavGroup[] = [
  { id: "desk", label: "Dashboard", items: DESK_NAV },
  { id: "more", label: "More", items: MORE_NAV },
];

export const NAV: NavItem[] = [...DESK_NAV, ...MORE_NAV, { href: "/settings", label: "Settings" }];

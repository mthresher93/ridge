export type NavItem = { href: string; label: string };

export type NavGroup = { id: string; label: string; items: NavItem[] };

export const DESK_NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/companies", label: "Companies" },
  { href: "/leads", label: "Leads" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/map", label: "Map" },
  { href: "/discover", label: "Discover" },
  { href: "/tasks", label: "Tasks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/calls", label: "Calls" },
  { href: "/call-logs", label: "Call logs" },
  { href: "/reports", label: "Reports" },
];

export function workPath(leadId?: string | null) {
  return leadId ? `/calls?id=${encodeURIComponent(leadId)}` : "/calls";
}

export const MORE_NAV: NavItem[] = [
  { href: "/playbook", label: "Intel" },
  { href: "/shipments", label: "Shipments" },
  { href: "/carriers", label: "Carriers" },
];

export const NAV_GROUPS: NavGroup[] = [
  { id: "desk", label: "Dashboard", items: DESK_NAV },
  { id: "more", label: "More", items: MORE_NAV },
];

export const NAV: NavItem[] = [...DESK_NAV, ...MORE_NAV, { href: "/settings", label: "Settings" }];

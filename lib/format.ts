import type { Lead } from "./types";

export function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function moneyShort(value: number) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return money(n);
}

export function phonePretty(value: string) {
  const match = String(value || "").match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (!match) return value || "—";
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

export function normalizePhone(value: string) {
  return String(value || "").replace(/[\s().-]/g, "");
}

export function validPhone(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

export function initials(name: string) {
  const parts = String(name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "U";
}

export function formatWhen(iso: string, timeZone?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatClock(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDateLong(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function relativeDue(iso: string, now = Date.now()) {
  if (!iso) return "No time set";
  const delta = Date.parse(iso) - now;
  const abs = Math.abs(delta);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const label =
    mins < 60 ? `${mins}m` : hours < 24 ? `${hours}h` : `${days}d`;
  if (delta < 0) return `${label} overdue`;
  if (delta < 3600000) return `in ${label}`;
  return label;
}

export function daysBetween(iso: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 86400000));
}

export function leadScore(lead: Lead) {
  let score = 0;
  if (lead.phone) score += 20;
  if (lead.email) score += 15;
  if (lead.property) score += 10;
  if (lead.consent === "verified") score += 20;
  if (lead.monthlyBill && lead.monthlyBill >= 200) score += 15;
  if (lead.nextAction) score += 10;
  if (lead.homeowner === "Yes") score += 10;
  if (lead.dnc) score = 0;
  return Math.min(100, score);
}

export function leadEligibility(lead: Lead): { tone: "ok" | "warn" | "bad"; label: string } {
  if (lead.dnc) return { tone: "bad", label: "DNC" };
  if (lead.consent === "missing") return { tone: "bad", label: "No consent" };
  if (lead.consent !== "verified") return { tone: "warn", label: "Consent pending" };
  if (!validPhone(lead.phone)) return { tone: "warn", label: "No valid phone" };
  return { tone: "ok", label: "Callable" };
}

export function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

export function nowIso() {
  return new Date().toISOString();
}

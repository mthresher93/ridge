const ZONE = "America/Chicago";

export function now(at?: Date | number | string) {
  if (at instanceof Date) return at;
  if (typeof at === "number") return new Date(at);
  if (typeof at === "string" && at) {
    const parsed = new Date(at);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function nowMs(at?: Date | number | string) {
  return now(at).getTime();
}

export function nowIso(at?: Date | number | string) {
  return now(at).toISOString();
}

export function userTimeZone() {
  return ZONE;
}

export function relativeToNow(iso: string, at?: Date | number | string) {
  if (!iso) return "—";
  const delta = Date.parse(iso) - nowMs(at);
  if (!Number.isFinite(delta)) return "—";
  const abs = Math.abs(delta);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const label = mins < 60 ? `${mins}m` : hours < 24 ? `${hours}h` : `${days}d`;
  if (delta < 0) return `${label} ago`;
  if (mins < 1) return "now";
  return `in ${label}`;
}

export function overdueLabel(iso: string, at?: Date | number | string) {
  if (!iso) return "";
  const delta = Date.parse(iso) - nowMs(at);
  if (!Number.isFinite(delta) || delta >= 0) return "";
  return relativeToNow(iso, at).replace(" ago", " overdue");
}

export function closeChip(iso: string, at?: Date | number | string) {
  if (!iso) return { label: "", tone: "none" as const };
  const date = now(iso);
  if (Number.isNaN(date.getTime())) return { label: "", tone: "none" as const };
  const label = `Closes ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: ZONE }).format(date)}`;
  const days = (date.getTime() - nowMs(at)) / 86400000;
  if (days < 0) return { label, tone: "bad" as const };
  if (days < 7) return { label, tone: "warn" as const };
  return { label, tone: "ok" as const };
}

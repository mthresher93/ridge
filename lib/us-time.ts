const STATE_TZ: Record<string, string> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Denver",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
};

export function zoneForState(state?: string) {
  const key = String(state || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  return STATE_TZ[key] || "";
}

function parseHmm(value: string) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function localClock(state?: string, now = new Date()) {
  const zone = zoneForState(state);
  if (!zone) {
    return { zone: "", label: "Local time unknown — add a US state", minutes: null as number | null, clock: "" };
  }
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    weekday: "short",
  }).format(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((item) => item.type === "hour")?.value || 0);
  const minute = Number(parts.find((item) => item.type === "minute")?.value || 0);
  return { zone, label: `${clock} ${zone.replace("_", " ")}`, minutes: hour * 60 + minute, clock };
}

export const BROKER_ZONE = "Asia/Phnom_Penh";
export const BOOK_ZONE = "America/Chicago";

export function formatZoneClock(zone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

export function deskClocks(now = new Date()) {
  return {
    broker: { zone: BROKER_ZONE, label: "Phnom Penh", clock: formatZoneClock(BROKER_ZONE, now) },
    book: { zone: BOOK_ZONE, label: "US Central", clock: formatZoneClock(BOOK_ZONE, now) },
  };
}

export function inCallingWindow(state: string | undefined, start: string, end: string, now = new Date()) {
  const local = localClock(state, now);
  const from = parseHmm(start);
  const to = parseHmm(end);
  if (local.minutes == null || from == null || to == null) {
    return { ok: true, why: "Confirm the contact’s local hours before you dial.", ...local };
  }
  const ok = local.minutes >= from && local.minutes <= to;
  return {
    ok,
    why: ok
      ? `Inside ${start}–${end} in their zone.`
      : `Outside ${start}–${end} in their zone. You are likely calling from outside the US — wait or they asked you to.`,
    ...local,
  };
}

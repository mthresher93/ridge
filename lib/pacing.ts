import type { KpiEvent } from "./types";

export const MESSAGE_SOFT_CAP = 25;
export const MESSAGE_HARD_WARN = 40;

export function messagesSentOnDay(events: KpiEvent[], now = Date.now()) {
  const day = new Date(now).toDateString();
  return events.filter((event) => event.type === "message_sent" && new Date(event.at).toDateString() === day).length;
}

export function pacingNote(sentToday: number) {
  if (sentToday >= MESSAGE_HARD_WARN) {
    return {
      level: "stop" as const,
      text: `${sentToday} marked sent today. Stop blasting. Switch channel or wait. Same wording across ads is how accounts get flagged.`,
    };
  }
  if (sentToday >= MESSAGE_SOFT_CAP) {
    return {
      level: "caution" as const,
      text: `${sentToday} sent today (soft cap ${MESSAGE_SOFT_CAP}). Slow down. Use a different variant. You send it — Haul does not.`,
    };
  }
  return {
    level: "ok" as const,
    text: `${sentToday} sent today. Stay under ~${MESSAGE_SOFT_CAP} per channel. Each copy uses a different wording so you are not pasting the same spam line.`,
  };
}

export function variantIndex(seed: string, sentToday: number, count: number) {
  let n = sentToday * 17;
  for (let i = 0; i < seed.length; i += 1) n += seed.charCodeAt(i);
  return Math.abs(n) % Math.max(1, count);
}

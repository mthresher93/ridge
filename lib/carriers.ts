import { normalizePhone, nowIso, uid } from "./format";
import type { Carrier, Workspace } from "./types";

const TOLL = /^(800|888|877|866|855|844|833)$/;

export function isCallablePhone(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  const n = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (n.length !== 10) return false;
  if (TOLL.test(n.slice(0, 3))) return false;
  if (n.slice(3, 6) === "555") return false;
  return true;
}

function firstMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[1]?.trim() || "";
}

export function extractCarrierFacts(pageText: string, url = "") {
  const blob = String(pageText || "");
  const mc = firstMatch(blob, /\bMC[-\s#:]*([0-9]{4,8})\b/i);
  const dot = firstMatch(blob, /\b(?:US\s*DOT|USDOT|DOT)[-\s#:]*([0-9]{5,8})\b/i);
  const phones = Array.from(blob.matchAll(/(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/g)).map((item) => item[0]);
  const phone = phones.find((item) => isCallablePhone(item)) || "";
  const email = firstMatch(blob, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  const nameLine =
    firstMatch(blob, /(?:legal name|carrier|company)\s*[:\-]\s*([A-Z][^\n]{3,80})/i) ||
    blob
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /[A-Za-z]{3}/.test(line) && !/mc-|usdot|phone|email/i.test(line)) ||
    "";
  const equipment = firstMatch(blob, /\b(hotshot|flatbed|step deck|rgn|lowboy|landoll|power only)\b/i);
  return {
    name: nameLine.slice(0, 160),
    mc,
    dot,
    phone,
    email,
    equipment,
    sourceUrl: url.trim(),
    notes: [mc && `MC ${mc}`, dot && `DOT ${dot}`, phone && `Phone ${phone}`].filter(Boolean).join(" · "),
  };
}

export function ingestCarrier(workspace: Workspace, payload: ReturnType<typeof extractCarrierFacts>) {
  const stamp = nowIso();
  const mc = payload.mc.trim();
  const phone = normalizePhone(payload.phone);
  const existing = (workspace.carriers || []).find((item) => {
    if (mc && item.mc === mc) return true;
    if (phone.length >= 10 && normalizePhone(item.phone) === phone) return true;
    return false;
  });
  const carrier: Carrier = existing
    ? {
        ...existing,
        name: payload.name || existing.name,
        mc: mc || existing.mc,
        dot: payload.dot || existing.dot,
        phone: payload.phone || existing.phone,
        email: payload.email || existing.email,
        equipment: payload.equipment || existing.equipment,
        sourceUrl: payload.sourceUrl || existing.sourceUrl,
        notes: payload.notes || existing.notes,
      }
    : {
        id: uid("cr"),
        name: payload.name || "Carrier",
        mc,
        dot: payload.dot,
        phone: payload.phone,
        email: payload.email,
        city: "",
        state: "",
        equipment: payload.equipment,
        sourceUrl: payload.sourceUrl,
        notes: payload.notes,
        createdAt: stamp,
      };
  const carriers = existing
    ? (workspace.carriers || []).map((item) => (item.id === carrier.id ? carrier : item))
    : [carrier, ...(workspace.carriers || [])];
  return {
    workspace: { ...workspace, carriers, updatedAt: stamp },
    carrier,
    duplicate: Boolean(existing),
  };
}

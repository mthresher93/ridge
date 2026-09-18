export function capText(value: unknown, max: number) {
  return String(value || "").slice(0, max);
}

export function asFiniteNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export type CaptureInput = {
  source?: unknown;
  url?: unknown;
  title?: unknown;
  description?: unknown;
  price?: unknown;
  location?: unknown;
  city?: unknown;
  state?: unknown;
  sellerName?: unknown;
  sellerUrl?: unknown;
  pageText?: unknown;
  phone?: unknown;
  email?: unknown;
  website?: unknown;
  category?: unknown;
  equipmentType?: unknown;
  dimensions?: unknown;
  weight?: unknown;
  quantity?: unknown;
  pickupLocation?: unknown;
  destination?: unknown;
  notes?: unknown;
  owner?: unknown;
};

export function parseCapturePayload(body: CaptureInput) {
  const title = capText(body.title, 200);
  const description = capText(body.description, 4000);
  const pageText = capText(body.pageText, 8000);
  const url = capText(body.url, 2000);
  const sellerName = capText(body.sellerName, 160);
  const hasSignal = Boolean(url || title || description || pageText || sellerName);
  if (!hasSignal) {
    return { ok: false as const, error: "Provide a url, title, description, or sellerName" };
  }
  return {
    ok: true as const,
    payload: {
      source: capText(body.source, 80) || undefined,
      url,
      title,
      description,
      price: body.price as string | number | null | undefined,
      location: capText(body.location, 120),
      city: capText(body.city, 80),
      state: capText(body.state, 40),
      sellerName,
      sellerUrl: capText(body.sellerUrl, 2000),
      pageText,
      phone: capText(body.phone, 40),
      email: capText(body.email, 160),
      website: capText(body.website, 400),
      category: capText(body.category, 80),
      equipmentType: capText(body.equipmentType, 80),
      dimensions: capText(body.dimensions, 80),
      weight: capText(body.weight, 40),
      quantity: body.quantity as number | string | null | undefined,
      pickupLocation: capText(body.pickupLocation, 120),
      destination: capText(body.destination, 120),
      notes: capText(body.notes, 2000),
      owner: capText(body.owner, 80) || undefined,
    },
  };
}

export function parseCopilotQuestion(body: { question?: unknown }) {
  const question = capText(body.question, 500).trim();
  if (!question) return { ok: false as const, error: "question required" };
  return { ok: true as const, question };
}

export const SHIPMENT_STATUSES = [
  "Quote",
  "Booked",
  "Carrier Needed",
  "Carrier Booked",
  "Pickup Scheduled",
  "In Transit",
  "Delivered",
  "Paid",
  "Problem",
  "Canceled",
] as const;

export function parseMoney(value: unknown) {
  const n = asFiniteNumber(value, NaN);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.round(n * 100) / 100;
}

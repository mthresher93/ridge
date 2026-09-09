import type { Lead } from "./types";
import { nowIso } from "./format";
import { classifyLoad } from "./load-class";

export type TrailerCode =
  | "HS"
  | "F"
  | "SDL"
  | "LSDL"
  | "RGN"
  | "RGNE"
  | "LB"
  | "VA"
  | "REEFER"
  | "CONESTOGA"
  | "LANDOLL"
  | "TILT"
  | "PO"
  | "DA"
  | "UNKNOWN";

export type LoadClass = "Parcel" | "Partial" | "LTL" | "TL" | "Always TL";

export type FitCheck = {
  code: TrailerCode;
  name: string;
  pass: boolean;
  fails: string[];
  warns: string[];
};

export type EquipmentFit = {
  trailer: TrailerCode;
  trailerName: string;
  loadClass: LoadClass;
  why: string;
  ask: string[];
  confidence: "known" | "estimate" | "unknown";
  lengthFt: number | null;
  widthFt: number | null;
  heightFt: number | null;
  weightLbs: number | null;
  checks: FitCheck[];
  alsoFits: TrailerCode[];
  usedGuess: boolean;
  legalNote: string;
};

export type TrailerCap = {
  code: TrailerCode;
  name: string;
  maxLengthFt: number;
  maxWidthFt: number;
  maxHeightFt: number;
  maxWeightLbs: number;
  deckGcFt: number | null;
  lengthLabel: string;
  notes: string;
};

export type UnitPreset = {
  id: string;
  label: string;
  text: string;
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  weightLbs: number;
};

export const UNIT_PRESETS: UnitPreset[] = [
  { id: "forklift", label: "Forklift", text: "forklift", lengthFt: 12, widthFt: 6, heightFt: 8, weightLbs: 9000 },
  { id: "skid", label: "Skid steer", text: "skid steer", lengthFt: 12, widthFt: 6, heightFt: 8, weightLbs: 8000 },
  { id: "mini-ex", label: "Mini excavator", text: "mini excavator", lengthFt: 14, widthFt: 6, heightFt: 8, weightLbs: 8000 },
  { id: "telehandler", label: "Telehandler", text: "telehandler", lengthFt: 19, widthFt: 8, heightFt: 8.5, weightLbs: 22000 },
  { id: "dump", label: "Dump truck", text: "dump truck", lengthFt: 27, widthFt: 8, heightFt: 10, weightLbs: 23000 },
  { id: "sleeper", label: "Sleeper cab", text: "sleeper cab", lengthFt: 28, widthFt: 8, heightFt: 13, weightLbs: 20000 },
  { id: "example-hs-tl", label: "26' @ 18k (HS TL)", text: "machine", lengthFt: 26, widthFt: 8.5, heightFt: 10, weightLbs: 18000 },
];

export const CALL_ASK = [
  { id: "photo", ask: "Do you have a photo of the unit on the ground?" },
  { id: "length", ask: "What's the length in feet?" },
  { id: "height", ask: "What's the height sitting on the deck — not overall on tires if it can be lowered?" },
  { id: "weight", ask: "What's the weight in pounds?" },
] as const;

/** Typical US interstate cap. Confirm the state — some are 13.5', some 14'. */
export const LEGAL_HEIGHT_FT = 13.6;

const TRAILER_NAMES: Record<TrailerCode, string> = {
  HS: "Hot Shot",
  F: "Flatbed",
  SDL: "Step Deck",
  LSDL: "Low Profile Step Deck",
  RGN: "RGN / Lowboy",
  RGNE: "Extendable RGN",
  LB: "Low Boy",
  VA: "Dry Van",
  REEFER: "Reefer",
  CONESTOGA: "Conestoga",
  LANDOLL: "Landoll",
  TILT: "Tilt trailer",
  PO: "Power Only",
  DA: "Drive Away",
  UNKNOWN: "Need specs",
};

export const TRAILER_CAPS: TrailerCap[] = [
  { code: "HS", name: "Hot Shot", maxLengthFt: 40, maxWidthFt: 8.5, maxHeightFt: 10.6, maxWeightLbs: 20000, deckGcFt: 3.6, lengthLabel: "20–40'", notes: "Pickup / medium-duty. Not all have ramps. Ramp cap ~18k lb." },
  { code: "SDL", name: "Step Deck", maxLengthFt: 53, maxWidthFt: 8.5, maxHeightFt: 10, maxWeightLbs: 45000, deckGcFt: 3.6, lengthLabel: "48–53'", notes: "Two levels. Better ramps than a flat for machines." },
  { code: "F", name: "Flatbed", maxLengthFt: 53, maxWidthFt: 8.5, maxHeightFt: 10, maxWeightLbs: 45000, deckGcFt: 5, lengthLabel: "48–53'", notes: "High deck. Confirm ramps before you book a machine." },
  { code: "LSDL", name: "Low Profile Step Deck", maxLengthFt: 53, maxWidthFt: 8.5, maxHeightFt: 11, maxWeightLbs: 45000, deckGcFt: 2.6, lengthLabel: "48–53'", notes: "Lower GC than a standard step. Use when height is 10–11'." },
  { code: "RGN", name: "RGN / Lowboy", maxLengthFt: 30, maxWidthFt: 8.5, maxHeightFt: 14, maxWeightLbs: 80000, deckGcFt: 1.5, lengthLabel: "Well 24–30'", notes: "Gooseneck comes off. Always TL. Well length is the limit, not 53'." },
  { code: "RGNE", name: "Extendable RGN", maxLengthFt: 50, maxWidthFt: 8.5, maxHeightFt: 14, maxWeightLbs: 80000, deckGcFt: 1.5, lengthLabel: "Well to 50'", notes: "When the unit is longer than a standard RGN well." },
];

export const MATCH_ORDER: TrailerCode[] = ["HS", "SDL", "F", "LSDL", "RGN", "RGNE"];

export type DeckGate = {
  id: "height" | "weight" | "length" | "width";
  label: string;
  ok: boolean | null;
  detail: string;
};

export function deckGates(fit: Pick<EquipmentFit, "lengthFt" | "widthFt" | "heightFt" | "weightLbs">): DeckGate[] {
  const hs = trailerCap("HS")!;
  const heightOk = fit.heightFt == null ? null : fit.heightFt <= hs.maxHeightFt;
  const weightOk = fit.weightLbs == null ? null : fit.weightLbs <= hs.maxWeightLbs;
  const lengthOk = fit.lengthFt == null ? null : fit.lengthFt <= hs.maxLengthFt;
  const widthOk = fit.widthFt == null ? null : fit.widthFt <= 8.5;
  return [
    {
      id: "height",
      label: "Height",
      ok: heightOk,
      detail:
        fit.heightFt == null
          ? "Need cargo height. Over 10.6' is not a hotshot. Over 11' is RGN territory."
          : heightOk
            ? `${fit.heightFt}' is in the hotshot band (≤ ${hs.maxHeightFt}').`
            : `${fit.heightFt}' is over ${hs.maxHeightFt}'. Do not quote a hotshot.`,
    },
    {
      id: "weight",
      label: "Weight",
      ok: weightOk,
      detail:
        fit.weightLbs == null
          ? "Need pounds. Over 20,000 lb is not a hotshot."
          : weightOk
            ? `${fit.weightLbs.toLocaleString()} lb is under ${hs.maxWeightLbs.toLocaleString()} lb.`
            : `${fit.weightLbs.toLocaleString()} lb is over ${hs.maxWeightLbs.toLocaleString()} lb. Not a hotshot.`,
    },
    {
      id: "length",
      label: "Length",
      ok: lengthOk,
      detail:
        fit.lengthFt == null
          ? "Need length. Over 40' is not a hotshot. Over 30' well needs an extendable RGN."
          : lengthOk
            ? `${fit.lengthFt}' fits a hotshot deck (≤ ${hs.maxLengthFt}').`
            : `${fit.lengthFt}' is over ${hs.maxLengthFt}'. Not a hotshot.`,
    },
    {
      id: "width",
      label: "Width",
      ok: widthOk,
      detail:
        fit.widthFt == null
          ? "Need width. Over 8.5' is usually permits, not a different trailer."
          : widthOk
            ? `${fit.widthFt}' is at or under 8.5' legal.`
            : `${fit.widthFt}' is over 8.5'. Same deck family — check escorts.`,
    },
  ];
}

export function cheaperFails(fit: EquipmentFit): FitCheck[] {
  const idx = MATCH_ORDER.indexOf(fit.trailer);
  if (idx <= 0) return [];
  return fit.checks.filter((item) => {
    const pos = MATCH_ORDER.indexOf(item.code);
    return pos >= 0 && pos < idx && !item.pass;
  });
}

export function trailerName(code: TrailerCode) {
  return TRAILER_NAMES[code];
}

export function trailerCap(code: TrailerCode) {
  return TRAILER_CAPS.find((item) => item.code === code) || null;
}

export function legalCargoFt(deckGcFt: number | null) {
  if (deckGcFt == null) return null;
  return roundFt(LEGAL_HEIGHT_FT - deckGcFt);
}

function roundFt(n: number) {
  return Math.round(n * 10) / 10;
}

function toFeet(n: number, unit: string | undefined, axis: "l" | "w" | "h") {
  const u = (unit || "").toLowerCase();
  if (u === '"' || u === "in" || u === "inch" || u === "inches") return roundFt(n / 12);
  if (u === "'" || u === "ft" || u === "feet") return n;
  if (axis === "l" && n > 80) return roundFt(n / 12);
  if ((axis === "w" || axis === "h") && n > 20) return roundFt(n / 12);
  return n;
}

function parseDimPart(chunk: string, axis: "l" | "w" | "h") {
  const m = String(chunk || "")
    .trim()
    .match(/(\d+(?:\.\d+)?)\s*(['"]|ft|feet|in|inch|inches)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return toFeet(n, m[2], axis);
}

export function parseFeet(value: string) {
  const text = String(value || "").toLowerCase().replace(/,/g, "");
  const quoted = text.match(/(\d+(?:\.\d+)?)\s*(?:'|ft|feet)/);
  if (quoted) return Number(quoted[1]);
  const inches = text.match(/(\d+(?:\.\d+)?)\s*(?:"|in|inch)/);
  if (inches) return roundFt(Number(inches[1]) / 12);
  const n = Number(text.match(/(\d+(?:\.\d+)?)/)?.[1]);
  return Number.isFinite(n) ? n : null;
}

export function parsePounds(value: string) {
  const text = String(value || "").toLowerCase().replace(/,/g, "");
  if (!text.trim()) return null;
  if (/\d\s*x\s*\d/.test(text) && !/(?:lbs?|pounds|#|kg|tons?)\b/.test(text)) return null;
  const tons = text.match(/(\d+(?:\.\d+)?)\s*(?:t|tons?)\b/);
  if (tons) return Math.round(Number(tons[1]) * 2000);
  const kg = text.match(/(\d+(?:\.\d+)?)\s*kg\b/);
  if (kg) return Math.round(Number(kg[1]) * 2.2046);
  const lbs = text.match(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds|#)/);
  if (lbs) return Math.round(Number(lbs[1]));
  const bare = text.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  return bare ? Math.round(Number(bare[1])) : null;
}

export function parseDimensions(value: string) {
  const text = String(value || "").replace(/×/g, "x").replace(/,/g, "");
  const chunks = text.split(/\s*x\s*/i).filter((part) => /\d/.test(part));
  if (chunks.length < 2) return { lengthFt: null as number | null, widthFt: null as number | null, heightFt: null as number | null };
  return {
    lengthFt: parseDimPart(chunks[0], "l"),
    widthFt: parseDimPart(chunks[1], "w"),
    heightFt: chunks[2] ? parseDimPart(chunks[2], "h") : null,
  };
}

type Guess = { lengthFt: number; widthFt: number; heightFt: number; weightLbs: number; trailer?: TrailerCode };

const UNIT_GUESSES: { test: RegExp; guess: Guess }[] = [
  { test: /\bday\s*cab\b.*\b1\s*axle|\bday cab 1/, guess: { lengthFt: 24, widthFt: 8, heightFt: 9.5, weightLbs: 14000, trailer: "SDL" } },
  { test: /\bday\s*cab\b.*\b2\s*axle|\bday cab 2/, guess: { lengthFt: 26, widthFt: 8, heightFt: 9.5, weightLbs: 16000, trailer: "SDL" } },
  { test: /\bsleeper\b/, guess: { lengthFt: 28, widthFt: 8, heightFt: 13, weightLbs: 20000, trailer: "RGN" } },
  { test: /\bmidroof\b/, guess: { lengthFt: 28, widthFt: 8, heightFt: 11.5, weightLbs: 20000, trailer: "LSDL" } },
  { test: /\bdump\s*truck\b.*\b3\s*axle/, guess: { lengthFt: 30, widthFt: 8, heightFt: 11, weightLbs: 28000, trailer: "LSDL" } },
  { test: /\bdump\s*truck\b.*\b2\s*axle/, guess: { lengthFt: 27, widthFt: 8, heightFt: 10, weightLbs: 23000, trailer: "SDL" } },
  { test: /\bdump\s*truck\b/, guess: { lengthFt: 24, widthFt: 8, heightFt: 10, weightLbs: 20000, trailer: "SDL" } },
  { test: /\bgarbage\s*truck|refuse\b/, guess: { lengthFt: 33, widthFt: 8, heightFt: 13.3, weightLbs: 28000, trailer: "RGN" } },
  { test: /\bschool\s*bus\b/, guess: { lengthFt: 38, widthFt: 8, heightFt: 10.5, weightLbs: 32000, trailer: "RGN" } },
  { test: /\bbucket\s*truck|boom\s*truck/, guess: { lengthFt: 34, widthFt: 8, heightFt: 13, weightLbs: 30000, trailer: "RGN" } },
  { test: /\bhino\s*npr\b/, guess: { lengthFt: 26, widthFt: 8, heightFt: 11.5, weightLbs: 20000, trailer: "RGN" } },
  { test: /\bbox\s*truck\b/, guess: { lengthFt: 26, widthFt: 8, heightFt: 10, weightLbs: 16000, trailer: "SDL" } },
  { test: /\bcargo\s*van\b/, guess: { lengthFt: 27, widthFt: 8, heightFt: 10, weightLbs: 16000, trailer: "SDL" } },
  { test: /\bmini\s*(ex|excavator|digger|hoe)\b/, guess: { lengthFt: 14, widthFt: 6, heightFt: 8, weightLbs: 8000, trailer: "HS" } },
  { test: /\bexcavator|dozer|bulldozer|crane\b/, guess: { lengthFt: 22, widthFt: 8.5, heightFt: 10.5, weightLbs: 28000, trailer: "RGN" } },
  { test: /\btelehandler\b/, guess: { lengthFt: 19, widthFt: 8, heightFt: 8.5, weightLbs: 22000, trailer: "SDL" } },
  { test: /\bforklift|skid\s*steer|bobcat|scissor\s*lift\b/, guess: { lengthFt: 12, widthFt: 6, heightFt: 8, weightLbs: 9000, trailer: "HS" } },
];

export function guessUnitSpecs(text: string): Guess | null {
  const blob = text.toLowerCase();
  const hit = UNIT_GUESSES.find((item) => item.test.test(blob));
  return hit ? { ...hit.guess } : null;
}

function rankLoad(lengthFt: number | null, weightLbs: number | null, trailer: TrailerCode): LoadClass {
  if (["RGN", "RGNE", "LB", "PO", "DA"].includes(trailer)) return "Always TL";
  const family = trailer === "HS" || trailer === "TILT" ? "hotshot" : "53";
  return classifyLoad(lengthFt, weightLbs, family);
}

export function checkTrailer(
  spec: TrailerCap,
  input: { lengthFt: number | null; widthFt: number | null; heightFt: number | null; weightLbs: number | null },
): FitCheck {
  const fails: string[] = [];
  const warns: string[] = [];
  const { lengthFt, widthFt, heightFt, weightLbs } = input;
  if (lengthFt != null && lengthFt > spec.maxLengthFt) {
    fails.push(`Length ${fmtFt(lengthFt)} over ${spec.lengthLabel} (${spec.maxLengthFt}').`);
  }
  if (heightFt != null && heightFt > spec.maxHeightFt) {
    fails.push(`Height ${fmtFt(heightFt)} over ${spec.maxHeightFt}' cargo cap.`);
  }
  if (weightLbs != null && weightLbs > spec.maxWeightLbs) {
    fails.push(`Weight ${weightLbs.toLocaleString()} lb over ${spec.maxWeightLbs.toLocaleString()} lb.`);
  }
  if (widthFt != null && widthFt > 8.5) {
    warns.push(`Width ${fmtFt(widthFt)} is over 8.5' legal — permits / escorts possible.`);
  }
  const remaining = legalCargoFt(spec.deckGcFt);
  if (heightFt != null && remaining != null && heightFt > remaining) {
    warns.push(`On this deck (GC ~${spec.deckGcFt}'), ${fmtFt(heightFt)} cargo is over ~${remaining}' remaining under ${LEGAL_HEIGHT_FT}' — confirm the state.`);
  }
  return { code: spec.code, name: spec.name, pass: fails.length === 0, fails, warns };
}

function fmtFt(n: number) {
  return `${roundFt(n)}'`;
}

function preferGuess(cheapest: TrailerCode, guessed: TrailerCode | undefined, checks: FitCheck[]) {
  if (!guessed || cheapest === guessed || cheapest === "UNKNOWN") return cheapest;
  const guessCheck = checks.find((item) => item.code === guessed);
  if (!guessCheck?.pass) return cheapest;
  const cheapIdx = MATCH_ORDER.indexOf(cheapest);
  if (cheapIdx >= 0 && cheapIdx <= 2) return cheapest;
  if (guessed === "RGN" || guessed === "RGNE" || guessed === "LB") return guessed;
  return cheapest;
}

function pickOpenDeck(checks: FitCheck[], blob: string, guessed?: TrailerCode, trustNumbers = false): TrailerCode {
  if (/\blandoll\b/.test(blob)) return "LANDOLL";
  if (/\btilt\b/.test(blob)) {
    const hs = checks.find((item) => item.code === "HS");
    if (hs?.pass) return "TILT";
  }
  const rgnPass = checks.find((item) => item.code === "RGN")?.pass;
  const rgnePass = checks.find((item) => item.code === "RGNE")?.pass;
  if (!trustNumbers && /\b(sleeper|school\s*bus|garbage|refuse|bucket\s*truck|boom\s*truck)\b/.test(blob)) {
    if (rgnPass) return "RGN";
    if (rgnePass) return "RGNE";
  }
  const cheapest = MATCH_ORDER.find((code) => checks.find((item) => item.code === code)?.pass) || "UNKNOWN";
  if (!trustNumbers && (guessed === "RGN" || guessed === "LB") && !rgnPass && rgnePass) return "RGNE";
  return preferGuess(cheapest, guessed, checks);
}

function whyFor(trailer: TrailerCode, checks: FitCheck[], lengthFt: number | null, widthFt: number | null, heightFt: number | null, weightLbs: number | null) {
  const chosen = checks.find((item) => item.code === trailer);
  const hs = checks.find((item) => item.code === "HS");
  const parts: string[] = [];
  if (trailer === "HS" && hs?.pass) {
    parts.push("Fits hotshot: under ~40' and 20,000 lb, height in the 10–10.6' band.");
  } else if (hs && !hs.pass) {
    parts.push(`Not hotshot: ${hs.fails.join(" ")}`);
  }
  if (chosen?.pass && trailer !== "HS") {
    const spec = trailerCap(trailer);
    parts.push(`Use ${TRAILER_NAMES[trailer]}${spec ? ` (cargo height to ${spec.maxHeightFt}', ${spec.lengthLabel}, ${spec.maxWeightLbs.toLocaleString()} lb)` : ""}.`);
  }
  if (chosen?.warns.length) parts.push(chosen.warns[0]);
  else if (widthFt != null && widthFt > 8.5) parts.push(`Width ${fmtFt(widthFt)} is over 8.5' legal — permits / escorts possible.`);
  if (!parts.length) {
    const specs = [lengthFt && `${fmtFt(lengthFt)} L`, widthFt && `${fmtFt(widthFt)} W`, heightFt && `${fmtFt(heightFt)} H`, weightLbs != null && `${weightLbs.toLocaleString()} lb`]
      .filter(Boolean)
      .join(" · ");
    parts.push(specs ? `Need a confirmed photo against ${specs}.` : "Need length, width, height, and weight before you pick a deck.");
  }
  return parts.join(" ");
}

export function recommendEquipment(input: {
  text?: string;
  dimensions?: string;
  weight?: string;
  lengthFt?: number | null;
  widthFt?: number | null;
  heightFt?: number | null;
  weightLbs?: number | null;
}): EquipmentFit {
  const blob = [input.text, input.dimensions, input.weight].filter(Boolean).join(" ").toLowerCase();
  const parsed = parseDimensions(input.dimensions || "");
  const parsedFromText = input.dimensions ? { lengthFt: null as number | null, widthFt: null as number | null, heightFt: null as number | null } : parseDimensions(blob);
  const guessed = guessUnitSpecs(blob);
  const explicitLength = input.lengthFt ?? parsed.lengthFt ?? parsedFromText.lengthFt;
  const explicitWidth = input.widthFt ?? parsed.widthFt ?? parsedFromText.widthFt;
  const explicitHeight = input.heightFt ?? parsed.heightFt ?? parsedFromText.heightFt;
  const explicitWeight = input.weightLbs ?? parsePounds(input.weight || "") ?? parsePounds(blob);
  const lengthFt = explicitLength ?? guessed?.lengthFt ?? null;
  const widthFt = explicitWidth ?? guessed?.widthFt ?? null;
  const heightFt = explicitHeight ?? guessed?.heightFt ?? null;
  const weightLbs = explicitWeight ?? guessed?.weightLbs ?? null;
  const usedGuess = Boolean(guessed && explicitLength == null && explicitHeight == null && explicitWeight == null);

  const dims = { lengthFt, widthFt, heightFt, weightLbs };
  const checks = TRAILER_CAPS.map((spec) => checkTrailer(spec, dims));
  const ask = ["Ask for a photo and full specs. Do not quote from a catalog guess alone."];
  if (lengthFt == null || weightLbs == null) ask.push("Need length and weight in feet and pounds.");
  if (/\btruck|semi|dump|bus\b/i.test(blob)) ask.push("Wheelbase matters for RGN well space. Confirm it.");
  const hasNumbers = lengthFt != null || widthFt != null || heightFt != null || weightLbs != null;
  if (
    !hasNumbers &&
    !guessed &&
    !/\b(landoll|tilt|power\s*only|drive[-\s]?away|reefer|refrigerat|produce|perishable|dry\s*van|palletized)\b/.test(blob)
  ) {
    return finish("UNKNOWN", dims, checks, "Need length, width, height, and weight before you pick a deck.", ask, "unknown", false);
  }

  if (/\bpower\s*only\b/.test(blob)) {
    return finish("PO", dims, checks, "Power only — tractor, no trailer. Trailer on site must be DOT-ready.", ask, "known", false);
  }
  if (/\bdrive[-\s]?away\b/.test(blob)) {
    return finish("DA", dims, checks, "Drive-away — unit needs plates and insurance, or the carrier provides temps.", ask, "known", false);
  }
  if (/\breefer|refrigerat|produce|perishable\b/i.test(blob)) {
    return finish("REEFER", dims, checks, "Temperature-sensitive freight. Reefer, not open deck.", ask, "estimate", usedGuess);
  }
  if (/\bdry\s*van|palletized|boxes of\b/i.test(blob) && !/\bforklift|machinery|excavator\b/i.test(blob)) {
    return finish("VA", dims, checks, "Enclosed dry goods. Dry van unless it must be open-loaded.", ask, "estimate", usedGuess);
  }

  const trailer = pickOpenDeck(checks, blob, guessed?.trailer, !usedGuess && (explicitLength != null || explicitHeight != null || explicitWeight != null));
  if (guessed?.trailer && guessed.trailer !== trailer && trailer !== "UNKNOWN" && !usedGuess) {
    ask.push(`The unit name often moves on ${TRAILER_NAMES[guessed.trailer]}. The numbers say ${TRAILER_NAMES[trailer]}. Trust the photo.`);
  }
  if (trailer === "UNKNOWN") ask.push("These numbers miss every standard deck in the table. Confirm specs or it is a specialized move.");

  const confidence: EquipmentFit["confidence"] = lengthFt != null && weightLbs != null && heightFt != null && !usedGuess ? "known" : guessed ? "estimate" : "unknown";
  return finish(trailer, dims, checks, whyFor(trailer, checks, lengthFt, widthFt, heightFt, weightLbs), ask, confidence, Boolean(usedGuess && guessed));
}

function finish(
  trailer: TrailerCode,
  dims: { lengthFt: number | null; widthFt: number | null; heightFt: number | null; weightLbs: number | null },
  checks: FitCheck[],
  why: string,
  ask: string[],
  confidence: EquipmentFit["confidence"],
  usedGuess: boolean,
): EquipmentFit {
  const spec = trailerCap(trailer);
  const remaining = spec ? legalCargoFt(spec.deckGcFt) : null;
  const legalNote = spec?.deckGcFt != null && remaining != null
    ? `State max ~${LEGAL_HEIGHT_FT}'. This deck’s GC is ~${spec.deckGcFt}' → about ${remaining}' of cargo height before you are over-height. Published cap on this deck is ${spec.maxHeightFt}'. Always confirm the state.`
    : `Confirm legal height in the origin and destination states (often ~${LEGAL_HEIGHT_FT}').`;
  const alsoFits = checks.filter((item) => item.pass && item.code !== trailer).map((item) => item.code);
  return {
    trailer,
    trailerName: TRAILER_NAMES[trailer],
    loadClass: rankLoad(dims.lengthFt, dims.weightLbs, trailer),
    why,
    ask: ask.slice(0, 4),
    confidence,
    lengthFt: dims.lengthFt,
    widthFt: dims.widthFt,
    heightFt: dims.heightFt,
    weightLbs: dims.weightLbs,
    checks,
    alsoFits,
    usedGuess,
    legalNote,
  };
}

export function measuredDimensions(lengthFt: number | null, widthFt: number | null, heightFt: number | null) {
  if (lengthFt == null || widthFt == null || heightFt == null) return "";
  return `${lengthFt} x ${widthFt} x ${heightFt}`;
}

export function specsFromLead(lead: Pick<Lead, "dimensions" | "weight" | "equipmentType">) {
  const parsed = parseDimensions(lead.dimensions || "");
  return {
    unit: lead.equipmentType || "",
    lengthFt: parsed.lengthFt,
    widthFt: parsed.widthFt,
    heightFt: parsed.heightFt,
    weightLbs: parsePounds(lead.weight || ""),
  };
}

export function applySpecsToLead(
  lead: Lead,
  input: {
    lengthFt?: number | null;
    widthFt?: number | null;
    heightFt?: number | null;
    weightLbs?: number | null;
    unit?: string;
  },
) {
  const lengthFt = input.lengthFt ?? null;
  const widthFt = input.widthFt ?? null;
  const heightFt = input.heightFt ?? null;
  const weightLbs = input.weightLbs ?? null;
  const measured = lengthFt != null || heightFt != null || weightLbs != null;
  if (!measured) {
    return {
      lead,
      fit: recommendEquipment({ text: input.unit }),
      saved: false,
      reason: "Type the numbers they told you. Catalog nicknames are not saved as specs.",
    };
  }
  const fit = recommendEquipment({
    text: input.unit,
    lengthFt,
    widthFt,
    heightFt,
    weightLbs,
  });
  const dims = measuredDimensions(fit.lengthFt, fit.widthFt, fit.heightFt);
  return {
    lead: {
      ...lead,
      dimensions: dims || lead.dimensions,
      weight: fit.weightLbs != null ? String(fit.weightLbs) : lead.weight,
      trailerHint: `${fit.trailerName} · ${fit.loadClass}`,
      loadClass: fit.loadClass,
      equipmentType: input.unit?.trim() || lead.equipmentType,
      updatedAt: nowIso(),
    },
    fit,
    saved: true,
    reason: "Saved measured specs on this client.",
  };
}

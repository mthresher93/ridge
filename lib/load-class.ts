export type ClassBand = "Parcel" | "Partial" | "LTL" | "TL";
export type LoadFamily = "53" | "hotshot";

const RANK: ClassBand[] = ["Parcel", "Partial", "LTL", "TL"];

function pickLarger(a: ClassBand, b: ClassBand): ClassBand {
  return RANK[Math.max(RANK.indexOf(a), RANK.indexOf(b))] || "Partial";
}

function band53Length(lengthFt: number): ClassBand {
  if (lengthFt < 10) return "Parcel";
  if (lengthFt <= 27) return "Partial";
  if (lengthFt <= 36) return "LTL";
  return "TL";
}

function band53Weight(weightLbs: number): ClassBand {
  if (weightLbs < 10000) return "Parcel";
  if (weightLbs <= 24000) return "Partial";
  if (weightLbs <= 33000) return "LTL";
  return "TL";
}

function bandHotshotLength(lengthFt: number): ClassBand {
  if (lengthFt < 5) return "Parcel";
  if (lengthFt <= 20) return "Partial";
  return "TL";
}

function bandHotshotWeight(weightLbs: number): ClassBand {
  if (weightLbs < 3000) return "Parcel";
  if (weightLbs <= 10000) return "Partial";
  return "TL";
}

export function classifyLoad(lengthFt: number | null, weightLbs: number | null, family: LoadFamily = "53"): ClassBand {
  if (lengthFt == null && weightLbs == null) return "Partial";
  const byLength: ClassBand | null =
    lengthFt == null ? null : family === "hotshot" ? bandHotshotLength(lengthFt) : band53Length(lengthFt);
  const byWeight: ClassBand | null =
    weightLbs == null ? null : family === "hotshot" ? bandHotshotWeight(weightLbs) : band53Weight(weightLbs);
  if (byLength && byWeight) return pickLarger(byLength, byWeight);
  return byLength || byWeight || "Partial";
}

export function classifyWhy(lengthFt: number | null, weightLbs: number | null, family: LoadFamily = "53") {
  const result = classifyLoad(lengthFt, weightLbs, family);
  const lengthBand =
    lengthFt == null ? null : family === "hotshot" ? bandHotshotLength(lengthFt) : band53Length(lengthFt);
  const weightBand =
    weightLbs == null ? null : family === "hotshot" ? bandHotshotWeight(weightLbs) : band53Weight(weightLbs);
  const parts = [
    lengthFt != null ? `${lengthFt}' → ${lengthBand}` : "length unknown",
    weightLbs != null ? `${weightLbs.toLocaleString()} lb → ${weightBand}` : "weight unknown",
  ];
  return {
    result,
    family,
    lengthBand,
    weightBand,
    why: `Uses the larger of length and weight (${family === "hotshot" ? "hot shot" : "53' equipment"}). ${parts.join("; ")}. Final: ${result}.`,
  };
}

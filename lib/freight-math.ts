import { LEGAL_HEIGHT_FT } from "./equipment";

export type CargoUnit = {
  lengthFt: number;
  widthFt: number;
  heightFt: number;
  weightLbs: number;
};

export type CombineLayout = "end-to-end" | "side-by-side" | "stacked";

export function combineUnits(units: CargoUnit[], layout: CombineLayout) {
  if (!units.length) {
    return { lengthFt: 0, widthFt: 0, heightFt: 0, weightLbs: 0, warnings: ["Add at least one unit."] };
  }
  const lengthFt =
    layout === "end-to-end" ? units.reduce((sum, item) => sum + item.lengthFt, 0) : Math.max(...units.map((item) => item.lengthFt));
  const widthFt =
    layout === "side-by-side" ? units.reduce((sum, item) => sum + item.widthFt, 0) : Math.max(...units.map((item) => item.widthFt));
  const heightFt =
    layout === "stacked" ? units.reduce((sum, item) => sum + item.heightFt, 0) : Math.max(...units.map((item) => item.heightFt));
  const weightLbs = units.reduce((sum, item) => sum + item.weightLbs, 0);
  const warnings: string[] = [];
  if (widthFt > 8.5) warnings.push(`Combined width ${widthFt}' is over 8.5' — permits / escorts possible. Confirm the states.`);
  if (lengthFt > 53) warnings.push(`Combined length ${lengthFt}' is over a standard 53' deck.`);
  if (weightLbs > 45000) warnings.push(`Combined weight ${weightLbs.toLocaleString()} lb is over a typical 45,000 lb deck. Confirm the trailer.`);
  if (heightFt + 0 > LEGAL_HEIGHT_FT) warnings.push(`Cargo height alone is already over ~${LEGAL_HEIGHT_FT}'. Confirm the states.`);
  return { lengthFt, widthFt, heightFt, weightLbs, warnings };
}

export function loadedHeight(deckHeightFt: number, cargoHeightFt: number) {
  const loaded = Math.round((deckHeightFt + cargoHeightFt) * 100) / 100;
  const legal = LEGAL_HEIGHT_FT;
  const oversize = loaded > legal;
  const approaching = !oversize && loaded >= legal - 0.5;
  return {
    deckHeightFt,
    cargoHeightFt,
    loadedFt: loaded,
    legalFt: legal,
    oversize,
    approaching,
    note: oversize
      ? `Loaded ~${loaded}' exceeds the ~${legal}' highway reference. This is not a state permit. Confirm origin and destination states.`
      : approaching
        ? `Loaded ~${loaded}' is close to the ~${legal}' highway reference. Confirm origin and destination states.`
        : `Loaded ~${loaded}' is under the ~${legal}' highway reference. Still confirm origin and destination states — rules are not identical.`,
  };
}

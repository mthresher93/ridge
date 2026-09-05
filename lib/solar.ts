import type { Lead, RoofDesign } from "./types";
import { coordsFor } from "./geo";
import { defaultFace, liveMetrics, ensureSite } from "./site";

export type SolarEstimate = {
  annualUse: number;
  panelCount: number;
  roofPanelCapacity: number;
  systemKw: number;
  annualProduction: number;
  offset: number;
  grossPrice: number;
  incentive: number;
  netPrice: number;
  annualSavings: number;
  payback: number;
  monthlyPayment: number;
  leaseMonthly: number;
  fit: number;
  heading: string;
};

const RATE = 0.16;
const PRICE_WATT = 3.05;
const ITC = 0.3;

export function defaultDesign(lead: Lead): RoofDesign {
  const city = lead.city || "";
  const southBias = /San Diego|Phoenix|Las Vegas|Bakersfield|Fresno|Riverside/i.test(city) ? 185 : 172;
  const coords = coordsFor(city, lead.id);
  const usableSqFt = Math.max(420, Math.round((lead.monthlyBill || 180) * 3.1));
  const roofMaterial = lead.city === "Las Vegas" ? "Concrete tile" : "Composition shingle";
  return {
    leadId: lead.id,
    azimuthDeg: southBias,
    tiltDeg: 22,
    roofMaterial,
    roofAge: 9,
    usableSqFt,
    shadeLoss: 8,
    annualSunHours: /Phoenix|Las Vegas|San Diego|Bakersfield|Fresno/i.test(city) ? 1980 : 1680,
    panelWatts: 425,
    storageInterest: /Taylor|Omar|Riley/i.test(lead.name) ? "Interested" : "Maybe",
    sunroofStatus: (lead.monthlyBill || 0) >= 250 ? "Strong fit" : "Review",
    updatedAt: lead.updatedAt,
    lat: coords.lat,
    lng: coords.lng,
    setbackFt: 3,
    panelWidthIn: 41,
    panelHeightIn: 74,
    spacingIn: 0.5,
    faces: [defaultFace(usableSqFt, southBias, 22)],
    obstructions: [],
    modules: [],
  };
}

export function estimateFor(lead: Lead, design: RoofDesign): SolarEstimate {
  const site = ensureSite(design);
  const live = liveMetrics(site);
  const bill = Number(lead.monthlyBill) || 0;
  const annualUse = bill ? Math.round((bill / RATE) * 12) : 9200;
  const sunYield = Math.max(850, design.annualSunHours * (1 - design.shadeLoss / 100) * 0.78);
  const targetKw = annualUse ? (annualUse * 0.9) / sunYield : 8;
  const roofSqFt = live.roofSqFt || design.usableSqFt;
  const roofPanelCapacity = Math.max(1, Math.floor(roofSqFt / 22));
  const panelCount =
    live.panelCount > 0
      ? live.panelCount
      : Math.max(1, Math.min(roofPanelCapacity, Math.ceil((targetKw * 1000) / design.panelWatts)));
  const systemKw = Math.round((panelCount * design.panelWatts) / 100) / 10;
  const annualProduction = Math.round(systemKw * sunYield);
  const offset = annualUse ? Math.min(120, Math.round((annualProduction / annualUse) * 100)) : 0;
  const grossPrice = Math.round(systemKw * 1000 * PRICE_WATT);
  const incentive = Math.round(grossPrice * ITC);
  const netPrice = grossPrice - incentive;
  const annualSavings = Math.round(Math.min(annualUse, annualProduction) * RATE);
  const payback = annualSavings ? netPrice / annualSavings : 0;
  const months = 240;
  const monthlyRate = 0.0699 / 12;
  const monthlyPayment = Math.round(
    (netPrice * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1),
  );
  const headingError = Math.min(Math.abs(design.azimuthDeg - 180), 360 - Math.abs(design.azimuthDeg - 180));
  const fit = Math.max(
    28,
    Math.min(
      97,
      Math.round(78 - headingError * 0.18 - design.shadeLoss * 0.55 - Math.max(0, design.roofAge - 14) * 0.8 + (bill >= 250 ? 6 : 0)),
    ),
  );
  const heading =
    headingError < 15 ? "True south" : headingError < 40 ? "South-west / south-east" : "Off-axis — production tax";
  return {
    annualUse,
    panelCount,
    roofPanelCapacity,
    systemKw,
    annualProduction,
    offset,
    grossPrice,
    incentive,
    netPrice,
    annualSavings,
    payback,
    monthlyPayment,
    leaseMonthly: Math.round(monthlyPayment * 0.84),
    fit,
    heading,
  };
}

export function compassLabel(deg: number) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}

export function auroraUrl(_address?: string) {
  void _address;
  return `https://app.aurorasolar.com/`;
}

export function sunroofUrl(address: string) {
  return `https://sunroof.withgoogle.com/building/0/#/?f=google&b=0&c=37.5,-122.2&z=19&address=${encodeURIComponent(address || "")}`;
}

/** Product identity — user-facing brand, not solar azimuth math. */
export const BRAND = {
  id: "meridian" as const,
  name: "Meridian",
  short: "Meridian",
  tagline: "Site to close",
  descriptor: "Solar sales desk",
  exportFile: "meridian-workspace.json",
  packagePrefix: "Meridian",
} as const;

export type BrandId = typeof BRAND.id;

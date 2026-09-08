export type Consent = "verified" | "unknown" | "missing";
export type Priority = "Low" | "Medium" | "High" | "Critical";
export type CallbackType = "hot" | "promising" | "standard" | "confirmation";
export type CallbackStatus = "open" | "completed";
export type Density = "compact" | "comfortable";
export type ShipperRole = "Yard" | "Private" | "Auction" | "Unknown";

export type Lead = {
  id: string;
  name: string;
  property: string;
  phone: string;
  email: string;
  city: string;
  state?: string;
  address?: string;
  utility: string;
  monthlyBill: number | null;
  status: string;
  priority: Priority;
  owner: string;
  source: string;
  consent: Consent;
  dnc: boolean;
  attempts: number;
  nextAction: string;
  nextFollowUp: string;
  estimatedValue: number;
  notes: string;
  homeowner: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  company?: string;
  website?: string;
  listingUrl?: string;
  sellerUrl?: string;
  category?: string;
  equipmentType?: string;
  freightScore?: number;
  scoreConfidence?: ScoreConfidence;
  scoreWhy?: string;
  freightType?: FreightType;
  recurringPotential?: RecurringPotential;
  lastContactAt?: string;
  tags?: string[];
  askingPrice?: number | null;
  origin?: string;
  destination?: string;
  listingTitle?: string;
  listingDescription?: string;
  companyId?: string;
  dimensions?: string;
  weight?: string;
  quantity?: number | null;
  label?: string;
  shipperRole?: ShipperRole;
  trailerHint?: string;
  loadClass?: string;
  booker?: string;
  bookerPhone?: string;
};

export type FreightType =
  | "LTL"
  | "FTL"
  | "Flatbed"
  | "Hotshot"
  | "Dry Van"
  | "Reefer"
  | "Vehicle Transport"
  | "Specialized / Oversized"
  | "Unknown";

export type ScoreConfidence = "HIGH" | "MEDIUM" | "LOW";
export type RecurringPotential = "High" | "Medium" | "Low";

export type Listing = {
  id: string;
  leadId: string;
  companyId?: string;
  source: string;
  sourceUrl: string;
  listingId?: string;
  title: string;
  description: string;
  sellerName: string;
  sellerUrl: string;
  city: string;
  state: string;
  askingPrice: number | null;
  category: string;
  equipmentType: string;
  dimensions: string;
  weight: string;
  quantity: number | null;
  pickupLocation: string;
  destination: string;
  phone: string;
  email: string;
  website: string;
  notes: string;
  imageUrls: string[];
  discoveredAt: string;
  priceHistory: { price: number; at: string }[];
};

export type Company = {
  id: string;
  name: string;
  website: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  sellerUrl: string;
  listingCount: number;
  categories: string[];
  avgItemValue: number;
  recurringCandidate: boolean;
  notes: string;
  createdAt: string;
};

export type Quote = {
  id: string;
  leadId: string;
  opportunityId?: string;
  origin: string;
  destination: string;
  commodity: string;
  equipmentType: string;
  customerRate: number;
  carrierCost: number;
  status: string;
  notes: string;
  createdAt: string;
};

export type ShipmentStatus =
  | "Quote"
  | "Booked"
  | "Carrier Needed"
  | "Carrier Booked"
  | "Pickup Scheduled"
  | "In Transit"
  | "Delivered"
  | "Paid"
  | "Problem"
  | "Canceled";

export type Shipment = {
  id: string;
  leadId: string;
  accountId?: string;
  quoteId?: string;
  carrierId?: string;
  customer: string;
  contact: string;
  origin: string;
  destination: string;
  pickupDate: string;
  deliveryDate: string;
  commodity: string;
  weight: string;
  dimensions: string;
  equipmentType: string;
  carrier: string;
  carrierRate: number;
  customerRate: number;
  status: ShipmentStatus;
  reference: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Carrier = {
  id: string;
  name: string;
  mc: string;
  dot: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  equipment: string;
  sourceUrl: string;
  notes: string;
  createdAt: string;
};

export type SavedSearch = {
  id: string;
  name: string;
  keywords: string;
  source: string;
  location: string;
  category: string;
  minValue: number | null;
  minFreightScore: number | null;
  status: string;
  huntUrl?: string;
  createdAt: string;
};

export type FreightAnalysis = {
  leadId: string;
  listingId?: string;
  score: number;
  confidence: ScoreConfidence;
  why: string;
  freightType: FreightType;
  recurringPotential: RecurringPotential;
  known: string[];
  estimates: string[];
  unknown: string[];
  openerCasual: string;
  openerDirect: string;
  openerBusiness: string;
  openerShort: string;
  openerFollowUp: string;
  analyzedAt: string;
  shipperRole?: ShipperRole;
  trailerHint?: string;
  loadClass?: string;
};

export type Point = { x: number; y: number };

export type RoofFace = {
  id: string;
  points: Point[];
  pitchDeg: number;
  azimuthDeg: number;
  heightFt: number;
  material: string;
  eligible?: boolean;
  source?: "survey" | "placeholder";
};

export type ObstructionKind = "vent" | "chimney" | "skylight" | "hvac" | "tree" | "structure";

export type Obstruction = {
  id: string;
  kind: ObstructionKind;
  x: number;
  y: number;
  widthFt: number;
  lengthFt: number;
  heightFt: number;
};

export type PlacedModule = {
  id: string;
  faceId: string;
  x: number;
  y: number;
  rotationDeg: number;
  portrait: boolean;
};

export type RoofDesign = {
  leadId: string;
  azimuthDeg: number;
  tiltDeg: number;
  roofMaterial: string;
  roofAge: number;
  usableSqFt: number;
  shadeLoss: number;
  annualSunHours: number;
  panelWatts: number;
  storageInterest: string;
  sunroofStatus: string;
  updatedAt: string;
  lat?: number;
  lng?: number;
  setbackFt?: number;
  panelWidthIn?: number;
  panelHeightIn?: number;
  spacingIn?: number;
  faces?: RoofFace[];
  obstructions?: Obstruction[];
  modules?: PlacedModule[];
};

export type ProposalSource = "modules" | "bill-plan";

export type Proposal = {
  leadId: string;
  status: string;
  version: number;
  notes: string;
  updatedAt: string;
  /** Snapshot at save — frozen from live design/estimate; optional for older records. */
  customerName?: string;
  property?: string;
  utility?: string;
  monthlyBill?: number | null;
  panelWatts?: number;
  panelCount?: number;
  systemKw?: number;
  roofSqFt?: number;
  coverage?: number;
  offset?: number;
  annualProduction?: number;
  annualUse?: number;
  grossPrice?: number;
  incentive?: number;
  netPrice?: number;
  monthlyPayment?: number;
  annualSavings?: number;
  azimuthDeg?: number;
  tiltDeg?: number;
  roofMaterial?: string;
  shadeLoss?: number;
  source?: ProposalSource;
  address?: string;
  city?: string;
  panelWidthIn?: number;
  panelHeightIn?: number;
  panelSqFt?: number;
  usableSqFt?: number;
  setbackFt?: number;
  faceCount?: number;
  annualSunHours?: number;
  arrayOutline?: {
    faces: { id: string; points: Point[]; eligible?: boolean }[];
    modules: { x: number; y: number; rotationDeg: number; portrait: boolean }[];
    panelWidthIn: number;
    panelHeightIn: number;
  };
};

export type CallLog = {
  id: string;
  leadId: string;
  outcome: string;
  duration: number;
  notes: string;
  at: string;
};

export type ScriptBeat = {
  id: string;
  label: string;
  say: string;
  cue: string;
};

export type StageHistory = {
  from: string;
  to: string;
  at: string;
  source: string;
};

export type Opportunity = {
  id: string;
  leadId: string | null;
  name: string;
  property: string;
  stage: string;
  value: number;
  probability: number;
  owner: string;
  source: string;
  nextAction: string;
  expectedClose: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  stageEnteredAt: string;
  history: StageHistory[];
  origin?: string;
  destination?: string;
  freightType?: string;
  commodity?: string;
};

export type Callback = {
  id: string;
  leadId: string;
  type: CallbackType;
  dueAt: string;
  reason: string;
  assignedUser: string;
  notes: string;
  status: CallbackStatus;
  createdAt: string;
  completedAt?: string;
};

export type Appointment = {
  id: string;
  leadId: string;
  type: string;
  startsAt: string;
  duration: number;
  setter: string;
  closer: string;
  location: string;
  status: string;
  notes: string;
  createdAt: string;
};

export type Activity = {
  id: string;
  entityType: string;
  entityId: string;
  type: string;
  detail: string;
  at: string;
};

export type KpiEvent = {
  id: string;
  type: string;
  leadId?: string;
  at: string;
  detail?: string;
};

export type ScriptModeSetting = "collapsed" | "split" | "focus";
export type Accent = "cyan" | "violet" | "amber" | "teal";

export type Settings = {
  operator: string;
  dialTarget: number;
  defaultOwner: string;
  density: Density;
  /** Optional fields added after launch — read through settingsWithDefaults(). */
  defaultScriptMode?: ScriptModeSetting;
  powerDelaySec?: number;
  dialWindowStart?: string;
  dialWindowEnd?: string;
  accent?: Accent;
  confirmBeforeDial?: boolean;
};

export const SETTINGS_DEFAULTS = {
  defaultScriptMode: "collapsed" as ScriptModeSetting,
  powerDelaySec: 2,
  dialWindowStart: "06:30",
  dialWindowEnd: "20:00",
  accent: "cyan" as Accent,
  confirmBeforeDial: false,
};

export function settingsWithDefaults(settings: Settings) {
  return { ...SETTINGS_DEFAULTS, ...Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined)) } as Required<Settings>;
}

export type Workspace = {
  version: number;
  brand: "azimuth";
  leads: Lead[];
  opportunities: Opportunity[];
  callbacks: Callback[];
  appointments: Appointment[];
  activities: Activity[];
  kpiEvents: KpiEvent[];
  designs: Record<string, RoofDesign>;
  proposals: Record<string, Proposal>;
  callLogs: CallLog[];
  listings: Listing[];
  companies: Company[];
  quotes: Quote[];
  shipments: Shipment[];
  carriers: Carrier[];
  savedSearches: SavedSearch[];
  analyses: FreightAnalysis[];
  settings: Settings;
  updatedAt: string;
  revision?: number;
};

export type Urgency = "critical" | "attention" | "healthy";

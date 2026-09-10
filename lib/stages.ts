export const STAGES = [
  "Discovered",
  "Ready to Contact",
  "Contacted",
  "Replied",
  "Qualified",
  "Contact Info Obtained",
  "Quote Requested",
  "Quote Sent",
  "Negotiating",
  "Load Won",
  "Load Lost",
  "Recurring Account",
] as const;

export type Stage = (typeof STAGES)[number];

export const PIPELINE_GROUPS = [
  {
    id: "hunt",
    label: "Hunt",
    drop: "Discovered",
    stages: ["Discovered", "Ready to Contact", "Contacted"],
  },
  {
    id: "talk",
    label: "Talk",
    drop: "Replied",
    stages: ["Replied", "Qualified", "Contact Info Obtained"],
  },
  {
    id: "quote",
    label: "Quote",
    drop: "Quote Requested",
    stages: ["Quote Requested", "Quote Sent", "Negotiating"],
  },
  {
    id: "close",
    label: "Close",
    drop: "Load Won",
    stages: ["Load Won", "Load Lost", "Recurring Account"],
  },
] as const;

export const WON_STAGES = new Set(["Load Won", "Recurring Account"]);
export const LOST_STAGES = new Set(["Load Lost"]);
export const CLOSED_STAGES = new Set(["Load Won", "Load Lost", "Recurring Account"]);

export const UNCONTACTED_STAGES = new Set(["Discovered", "Ready to Contact"]);
export const CONTACTED_STAGES = new Set([
  "Contacted",
  "Replied",
  "Qualified",
  "Contact Info Obtained",
  "Quote Requested",
  "Quote Sent",
  "Negotiating",
  "Load Won",
  "Recurring Account",
]);
export const REPLIED_STAGES = new Set([
  "Replied",
  "Qualified",
  "Contact Info Obtained",
  "Quote Requested",
  "Quote Sent",
  "Negotiating",
  "Load Won",
  "Recurring Account",
]);
export const QUALIFIED_STAGES = new Set([
  "Qualified",
  "Contact Info Obtained",
  "Quote Requested",
  "Quote Sent",
  "Negotiating",
  "Load Won",
  "Recurring Account",
]);
export const QUOTE_STAGES = new Set(["Quote Requested", "Quote Sent", "Negotiating", "Load Won", "Recurring Account"]);
export const PHONE_STAGES = new Set(["Contact Info Obtained", "Quote Requested", "Quote Sent", "Negotiating", "Load Won", "Recurring Account"]);

export const LEGACY_STAGE_MAP: Record<string, Stage> = {
  "New Lead": "Discovered",
  "Attempting Contact": "Ready to Contact",
  Contacted: "Contacted",
  Qualified: "Qualified",
  "Promising Callback": "Replied",
  "Appointment Set": "Quote Requested",
  "Appointment Confirmed": "Quote Sent",
  "Appointment Sat": "Negotiating",
  Proposal: "Quote Sent",
  "Contract Sent": "Negotiating",
  "Contract Signed": "Load Won",
  "Site Survey": "Quote Requested",
  Design: "Quote Sent",
  Permitting: "Negotiating",
  "Installation Scheduled": "Load Won",
  Installed: "Load Won",
  PTO: "Recurring Account",
  "Closed Won": "Load Won",
  "Closed Lost": "Load Lost",
  Cancelled: "Load Lost",
};

export function groupForStage(stage: string) {
  return PIPELINE_GROUPS.find((group) => (group.stages as readonly string[]).includes(stage));
}

export function mapLegacyStage(stage: string): Stage {
  if ((STAGES as readonly string[]).includes(stage)) return stage as Stage;
  return LEGACY_STAGE_MAP[stage] || "Discovered";
}

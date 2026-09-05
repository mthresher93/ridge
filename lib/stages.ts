export const STAGES = [
  "New Lead",
  "Attempting Contact",
  "Contacted",
  "Qualified",
  "Promising Callback",
  "Appointment Set",
  "Appointment Confirmed",
  "Appointment Sat",
  "Proposal",
  "Contract Sent",
  "Contract Signed",
  "Site Survey",
  "Design",
  "Permitting",
  "Installation Scheduled",
  "Installed",
  "PTO",
  "Closed Won",
  "Closed Lost",
  "Cancelled",
] as const;

export type Stage = (typeof STAGES)[number];

export const PIPELINE_GROUPS = [
  {
    id: "inbound",
    label: "Inbound",
    drop: "New Lead",
    stages: ["New Lead", "Attempting Contact", "Contacted"],
  },
  {
    id: "qualified",
    label: "Qualified",
    drop: "Qualified",
    stages: ["Qualified", "Promising Callback"],
  },
  {
    id: "set",
    label: "Set",
    drop: "Appointment Set",
    stages: ["Appointment Set", "Appointment Confirmed", "Appointment Sat"],
  },
  {
    id: "paper",
    label: "Paper",
    drop: "Proposal",
    stages: ["Proposal", "Contract Sent", "Contract Signed"],
  },
  {
    id: "build",
    label: "Build",
    drop: "Site Survey",
    stages: ["Site Survey", "Design", "Permitting", "Installation Scheduled", "Installed", "PTO"],
  },
  {
    id: "closed",
    label: "Closed",
    drop: "Closed Won",
    stages: ["Closed Won", "Closed Lost", "Cancelled"],
  },
] as const;

export const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost", "Cancelled"]);

export function groupForStage(stage: string) {
  return PIPELINE_GROUPS.find((group) => (group.stages as readonly string[]).includes(stage));
}

import { settingsWithDefaults, type Workspace } from "./types";

export type HonestStatus = "connected" | "simulated" | "demo";

export function integrationStatus(workspace: Workspace): { status: HonestStatus; label: string; detail: string } {
  const prefs = settingsWithDefaults(workspace.settings);
  if (prefs.companyApiUrl) {
    return { status: "connected", label: "Connected", detail: "Company API URL is set." };
  }
  if ((workspace.callLogs || []).length > 0) {
    return { status: "simulated", label: "Simulated", detail: "Calls are logged locally. No live telephony." };
  }
  return { status: "demo", label: "Local", detail: "This desk runs on localhost. Hunt public pages yourself." };
}

export const DISPOSITIONS = [
  { id: "appointment_set", label: "Appointment set", status: "Appointment Set", kpi: "appointment_set" },
  { id: "callback_scheduled", label: "Callback", status: "Promising Callback", kpi: "callback_scheduled", when: true },
  { id: "qualified_lead", label: "Qualified", status: "Qualified", kpi: "qualified_lead" },
  { id: "no_answer", label: "No answer", kpi: "no_answer" },
  { id: "voicemail", label: "Voicemail", kpi: "voicemail" },
  { id: "busy", label: "Busy", kpi: "busy" },
  { id: "not_interested", label: "Not interested", status: "Closed Lost", kpi: "not_interested" },
  { id: "wrong_number", label: "Wrong number", kpi: "wrong_number" },
  { id: "disqualified", label: "Disqualified", status: "Closed Lost", kpi: "disqualified" },
  { id: "dnc", label: "Do not call", kpi: "dnc", dnc: true },
] as const;

export type DispositionId = (typeof DISPOSITIONS)[number]["id"];

export const CALL_STATES = {
  ready: { label: "Ready", tone: "ready" },
  dialing: { label: "Dialing", tone: "progress" },
  ringing: { label: "Ringing", tone: "progress" },
  connected: { label: "Connected", tone: "live" },
  hold: { label: "On hold", tone: "hold" },
  muted: { label: "Muted", tone: "hold" },
  wrap: { label: "Disposition", tone: "wrap" },
  failed: { label: "Failed", tone: "down" },
} as const;

export type DialState = keyof typeof CALL_STATES;

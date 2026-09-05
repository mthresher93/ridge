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

/**
 * Coherent call-state system. Tones map to one color each:
 * idle → muted text · progress → cyan pulse · live → teal · hold → amber
 * wrap → violet · down → red · outcome → slate (terminal, informational)
 */
export const CALL_STATES = {
  ready: { label: "Ready", tone: "idle" },
  dialing: { label: "Dialing", tone: "progress" },
  ringing: { label: "Ringing", tone: "progress" },
  answered: { label: "Answered", tone: "live" },
  connected: { label: "Connected", tone: "live" },
  hold: { label: "On hold", tone: "hold" },
  muted: { label: "Muted", tone: "hold" },
  transferring: { label: "Transferring", tone: "hold" },
  wrap: { label: "Wrap-up", tone: "wrap" },
  failed: { label: "Failed", tone: "down" },
  no_answer: { label: "No answer", tone: "outcome" },
  busy: { label: "Busy", tone: "outcome" },
  voicemail: { label: "Voicemail", tone: "outcome" },
  disconnected: { label: "Disconnected", tone: "outcome" },
} as const;

export type DialState = "ready" | "dialing" | "ringing" | "connected" | "hold" | "muted" | "wrap" | "failed";
export type CallStateKey = keyof typeof CALL_STATES;

/** Resolve the visible stamp: during wrap-up show the terminal outcome, not a generic label. */
export function visibleCallState(state: DialState, muted: boolean, wrapOutcome: DispositionId): CallStateKey {
  if (state === "wrap") {
    if (wrapOutcome === "no_answer") return "no_answer";
    if (wrapOutcome === "voicemail") return "voicemail";
    if (wrapOutcome === "busy") return "busy";
    return "disconnected";
  }
  if ((state === "connected" || state === "hold") && muted) return "muted";
  return state;
}

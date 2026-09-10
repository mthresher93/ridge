export type CallState = "idle" | "connecting" | "active" | "held" | "ended";

export type CallSnapshot = {
  state: CallState;
  muted: boolean;
  held: boolean;
  phone: string;
  startedAt: string | null;
};

export type TelephonyProvider = {
  startCall: (phone: string) => CallSnapshot;
  endCall: () => CallSnapshot;
  mute: () => CallSnapshot;
  unmute: () => CallSnapshot;
  sendDTMF: (tone: string) => CallSnapshot;
  hold: () => CallSnapshot;
  resume: () => CallSnapshot;
  getCallState: () => CallSnapshot;
};

function snapshot(state: CallState, muted: boolean, held: boolean, phone: string, startedAt: string | null): CallSnapshot {
  return { state, muted, held, phone, startedAt };
}

export function createSimulatedTelephony(): TelephonyProvider {
  let state: CallState = "idle";
  let muted = false;
  let held = false;
  let phone = "";
  let startedAt: string | null = null;
  const snap = () => snapshot(state, muted, held, phone, startedAt);
  return {
    startCall(next) {
      phone = String(next || "").trim();
      muted = false;
      held = false;
      state = phone ? "active" : "idle";
      startedAt = phone ? new Date().toISOString() : null;
      return snap();
    },
    endCall() {
      state = phone ? "ended" : "idle";
      muted = false;
      held = false;
      return snap();
    },
    mute() {
      if (state === "active" || state === "held") muted = true;
      return snap();
    },
    unmute() {
      muted = false;
      return snap();
    },
    sendDTMF() {
      return snap();
    },
    hold() {
      if (state === "active") {
        held = true;
        state = "held";
      }
      return snap();
    },
    resume() {
      if (state === "held") {
        held = false;
        state = "active";
      }
      return snap();
    },
    getCallState: snap,
  };
}

export function telHref(phone: string) {
  const raw = String(phone || "").trim();
  return raw ? `tel:${raw}` : "";
}

export function createBrowserTelephony(): TelephonyProvider {
  const sim = createSimulatedTelephony();
  return {
    startCall(phone) {
      const href = telHref(phone);
      if (href && typeof window !== "undefined") window.location.href = href;
      return sim.startCall(phone);
    },
    endCall: sim.endCall,
    mute: sim.mute,
    unmute: sim.unmute,
    sendDTMF: sim.sendDTMF,
    hold: sim.hold,
    resume: sim.resume,
    getCallState: sim.getCallState,
  };
}

let browser: TelephonyProvider | null = null;

export function browserTelephony() {
  if (!browser) browser = createBrowserTelephony();
  return browser;
}

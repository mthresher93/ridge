"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { leadEligibility, nowIso, phonePretty, uid } from "@/lib/format";
import { estimateFor } from "@/lib/solar";
import { CALL_STATES, DISPOSITIONS, type DialState, type DispositionId } from "@/lib/dispositions";
import { completeOpenCallbacks, syncOpportunityFromWrap } from "@/lib/crm";
import { ScriptPanel } from "./script-panel";
import { AudioPopover } from "./audio-popover";
import { WrapSheet } from "./wrap-sheet";
import type { Lead } from "@/lib/types";

type ScriptMode = "collapsed" | "split" | "focus";
type Session = {
  attempts: number;
  answered: number;
  talkSec: number;
  appointments: number;
  noAnswer: number;
  voicemail: number;
  followUps: number;
};

const EMPTY_SESSION: Session = {
  attempts: 0,
  answered: 0,
  talkSec: 0,
  appointments: 0,
  noAnswer: 0,
  voicemail: 0,
  followUps: 0,
};

const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function FloorView() {
  const { workspace, setWorkspace, log, loading, selectedLeadId, setSelectedLeadId } = useWorkspace();
  const [state, setState] = useState<DialState>("ready");
  const [seconds, setSeconds] = useState(0);
  const [beat, setBeat] = useState(0);
  const [notes, setNotes] = useState("");
  const [muted, setMuted] = useState(false);
  const [scriptMode, setScriptMode] = useState<ScriptMode>("collapsed");
  const [power, setPower] = useState(false);
  const [pad, setPad] = useState("");
  const [showPad, setShowPad] = useState(false);
  const [session, setSession] = useState<Session>(EMPTY_SESSION);
  const [autoDial, setAutoDial] = useState(false);
  const [callableOnly, setCallableOnly] = useState(true);
  const [wrapDefault, setWrapDefault] = useState<DispositionId>("no_answer");
  const powerRef = useRef(false);
  const connectedRef = useRef(false);
  const stateRef = useRef(state);
  const activeRef = useRef<Lead | null>(null);
  powerRef.current = power;
  stateRef.current = state;

  const queue = useMemo(() => {
    const due = new Map(workspace.callbacks.filter((item) => item.status === "open").map((item) => [item.leadId, item.dueAt]));
    return workspace.leads
      .filter((lead) => !lead.dnc)
      .filter((lead) => (callableOnly ? leadEligibility(lead).tone === "ok" : true))
      .sort((a, b) => {
        const dueA = due.get(a.id);
        const dueB = due.get(b.id);
        if (dueA && dueB) return Date.parse(dueA) - Date.parse(dueB);
        if (dueA) return -1;
        if (dueB) return 1;
        return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || b.attempts - a.attempts;
      });
  }, [workspace.leads, workspace.callbacks, callableOnly]);

  const active = workspace.leads.find((lead) => lead.id === selectedLeadId) || queue[0] || null;
  activeRef.current = active;
  const design = active ? workspace.designs?.[active.id] : null;
  const estimate = active && design ? estimateFor(active, design) : null;
  const eligibility = active ? leadEligibility(active) : null;
  const canDial = eligibility?.tone === "ok";
  const remaining = queue.filter((lead) => leadEligibility(lead).tone === "ok" && lead.id !== active?.id).length;
  const live = state === "connected" || state === "hold" || state === "muted";
  const visual: DialState = live && muted ? "muted" : state;
  const stamp = CALL_STATES[visual];
  const history = (workspace.callLogs || []).filter((row) => row.leadId === active?.id).slice(0, 4);
  const dialTarget = workspace.settings.dialTarget || 80;
  const targetPct = Math.min(100, Math.round((session.attempts / dialTarget) * 100));
  const answerRate = session.attempts ? Math.round((session.answered / session.attempts) * 100) : 0;
  const setRate = session.attempts ? Math.round((session.appointments / session.attempts) * 100) : 0;
  const ringing = state === "dialing" || state === "ringing";
  const stageTone = ringing ? "progress" : live ? (muted || state === "hold" ? "hold" : "live") : state === "wrap" ? "wrap" : state === "failed" ? "down" : "ready";

  useEffect(() => {
    if (active) setNotes(active.notes);
  }, [active?.id]);

  useEffect(() => {
    if (state !== "dialing" && state !== "ringing" && state !== "connected" && state !== "hold" && state !== "muted") return;
    const id = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (state !== "dialing") return;
    const id = window.setTimeout(() => setState("ringing"), 900);
    return () => window.clearTimeout(id);
  }, [state]);

  useEffect(() => {
    if (state !== "ringing") return;
    const roll = Math.random();
    const id = window.setTimeout(() => {
      if (roll < 0.62) {
        connectedRef.current = true;
        setState("connected");
        setBeat(1);
        setSession((prev) => ({ ...prev, answered: prev.answered + 1 }));
      } else if (roll < 0.82) {
        connectedRef.current = false;
        setWrapDefault("no_answer");
        setState("wrap");
        setSession((prev) => ({ ...prev, noAnswer: prev.noAnswer + 1 }));
      } else {
        connectedRef.current = false;
        setWrapDefault("voicemail");
        setState("wrap");
        setSession((prev) => ({ ...prev, voicemail: prev.voicemail + 1 }));
      }
    }, 1400 + Math.floor(Math.random() * 900));
    return () => window.clearTimeout(id);
  }, [state]);

  function pick(id: string) {
    if (state !== "ready" && state !== "wrap" && state !== "failed") return;
    setSelectedLeadId(id);
    setState("ready");
    setSeconds(0);
    setBeat(0);
    setMuted(false);
    setPad("");
    setShowPad(false);
  }

  function startCall() {
    if (!active || !canDial) return;
    setSeconds(0);
    setMuted(false);
    connectedRef.current = false;
    setState("dialing");
    setSession((prev) => ({ ...prev, attempts: prev.attempts + 1 }));
    setWorkspace((prev) => ({
      ...prev,
      leads: prev.leads.map((lead) => (lead.id === active.id ? { ...lead, attempts: lead.attempts + 1, updatedAt: nowIso() } : lead)),
      kpiEvents: [{ id: uid("kpi"), type: "dial_attempt", leadId: active.id, at: nowIso() }, ...prev.kpiEvents],
      updatedAt: nowIso(),
    }));
    log("lead", active.id, "dial_attempt", "Dial started");
  }

  function hangup() {
    if (live) setSession((prev) => ({ ...prev, talkSec: prev.talkSec + seconds }));
    setWrapDefault("qualified_lead");
    setState("wrap");
    setMuted(false);
    setShowPad(false);
  }

  function cancelRing() {
    connectedRef.current = false;
    setWrapDefault("no_answer");
    setState("wrap");
  }

  function nextCallable(fromId: string) {
    const start = queue.findIndex((lead) => lead.id === fromId);
    const rotated = [...queue.slice(start + 1), ...queue.slice(0, Math.max(0, start))];
    return rotated.find((lead) => leadEligibility(lead).tone === "ok") || null;
  }

  function applyWrap(id: DispositionId, when?: string, advance?: boolean) {
    if (!active) return;
    const row = DISPOSITIONS.find((item) => item.id === id);
    if (!row) return;
    const due = when ? new Date(when).toISOString() : nowIso();
    const logRow = {
      id: uid("call"),
      leadId: active.id,
      outcome: id,
      duration: seconds,
      notes,
      at: nowIso(),
    };
    setWorkspace((prev) => {
      const withLead = {
        ...prev,
        leads: prev.leads.map((lead) =>
          lead.id === active.id
            ? {
                ...lead,
                status: "status" in row && row.status ? row.status : lead.status,
                nextAction: row.label,
                notes,
                dnc: "dnc" in row && row.dnc ? true : lead.dnc,
                updatedAt: nowIso(),
              }
            : lead,
        ),
        kpiEvents: [
          { id: uid("kpi"), type: connectedRef.current ? "connected_call" : id, leadId: active.id, at: nowIso(), detail: `${seconds}s` },
          { id: uid("kpi"), type: id, leadId: active.id, at: nowIso(), detail: row.label },
          ...prev.kpiEvents,
        ],
        callLogs: [logRow, ...(prev.callLogs || [])],
        callbacks:
          id === "callback_scheduled"
            ? [
                {
                  id: uid("cb"),
                  leadId: active.id,
                  type: "promising" as const,
                  dueAt: due,
                  reason: notes || "Callback from wrap-up",
                  assignedUser: prev.settings.operator,
                  notes,
                  status: "open" as const,
                  createdAt: nowIso(),
                },
                ...completeOpenCallbacks(prev.callbacks, active.id, id),
              ]
            : completeOpenCallbacks(prev.callbacks, active.id, id),
        appointments:
          id === "appointment_set"
            ? [
                {
                  id: uid("sit"),
                  leadId: active.id,
                  type: "Consult",
                  startsAt: due,
                  duration: 45,
                  setter: prev.settings.operator,
                  closer: prev.settings.defaultOwner,
                  location: active.property,
                  status: "scheduled",
                  notes,
                  createdAt: nowIso(),
                },
                ...prev.appointments,
              ]
            : prev.appointments,
        updatedAt: nowIso(),
      };
      return {
        ...withLead,
        opportunities: syncOpportunityFromWrap(withLead, active.id, id),
      };
    });
    log("lead", active.id, id, row.label);
    setSession((prev) => ({
      ...prev,
      appointments: prev.appointments + (id === "appointment_set" ? 1 : 0),
      noAnswer: prev.noAnswer + (id === "no_answer" ? 1 : 0),
      voicemail: prev.voicemail + (id === "voicemail" ? 1 : 0),
      followUps: prev.followUps + (id === "callback_scheduled" ? 1 : 0),
    }));
    setState("ready");
    setSeconds(0);
    setBeat(0);
    setShowPad(false);
    const nxt = advance || powerRef.current ? nextCallable(active.id) : null;
    if (nxt) {
      setSelectedLeadId(nxt.id);
      if (powerRef.current) setAutoDial(true);
    }
  }

  useEffect(() => {
    if (!autoDial) return;
    const id = window.setTimeout(() => {
      setAutoDial(false);
      startCall();
    }, 450);
    return () => window.clearTimeout(id);
  }, [autoDial, selectedLeadId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const current = stateRef.current;
      if (event.code === "Space" && (current === "ready" || current === "failed")) {
        event.preventDefault();
        if (activeRef.current && leadEligibility(activeRef.current).tone === "ok") startCall();
      }
      if (event.key === "Escape") {
        if (current === "connected" || current === "hold" || current === "muted") hangup();
        else if (current === "dialing" || current === "ringing") cancelRing();
      }
      if ((event.key === "m" || event.key === "M") && (current === "connected" || current === "hold" || current === "muted")) {
        setMuted((v) => !v);
      }
      if (event.key === "ArrowRight") setBeat((n) => n + 1);
      if (event.key === "ArrowLeft") setBeat((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) return <div className="text-[var(--muted)]">Opening the dialer…</div>;

  return (
    <div className="dialer-desk">
      <header className="dialer-chrome">
        <div className="dialer-session" title={`No answer ${session.noAnswer} · Voicemail ${session.voicemail} · Follow-ups ${session.followUps} · Talk ${fmt(session.talkSec)} · Set ${setRate}%`}>
          <SessionStat label="Dials" value={`${session.attempts}`} />
          <SessionStat label="Answer" value={`${answerRate}%`} />
          <SessionStat label="Sets" value={`${session.appointments}`} />
          <div className="dialer-pace">
            <div className="dialer-pace-meta">
              <span>Pace</span>
              <b className="az-num">
                {session.attempts}/{dialTarget}
              </b>
            </div>
            <div className="dial-target-meter" title={`${targetPct}% of daily dial target`}>
              <span style={{ width: `${targetPct}%` }} />
            </div>
          </div>
          <SessionStat label="Left" value={`${remaining}`} />
        </div>
        <div className="dialer-tools">
          <button type="button" className={`az-btn ${power ? "pri" : ""}`} onClick={() => setPower((v) => !v)}>
            {power ? "Power · on" : "Power dial"}
          </button>
          <AudioPopover />
          <div className="script-mode" role="tablist" aria-label="Workspace mode">
            {(["collapsed", "split", "focus"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={scriptMode === item}
                className={scriptMode === item ? "on" : ""}
                onClick={() => setScriptMode(item)}
              >
                {item === "collapsed" ? "Call" : item === "split" ? "Split" : "Script"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={`dialer-layout ${scriptMode}`}>
        <aside className="dialer-rail">
          <div className="dialer-rail-head">
            <div>
              <span>{power ? "Power" : "Queue"}</span>
              <b className="az-num">{queue.length}</b>
            </div>
            <button type="button" className={`rail-filter ${callableOnly ? "on" : ""}`} onClick={() => setCallableOnly((v) => !v)}>
              {callableOnly ? "Callable" : "All"}
            </button>
          </div>
          <div className="scroll-y flex-1">
            {queue.map((lead) => {
              const tone = leadEligibility(lead).tone;
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => pick(lead.id)}
                  className={`dialer-q-row ${active?.id === lead.id ? "on" : ""}`}
                  title={`${lead.name} · ${lead.city}`}
                >
                  {scriptMode === "focus" ? (
                    <b className="dialer-q-initials">{lead.name.split(" ").map((part) => part[0]).join("")}</b>
                  ) : (
                    <>
                      <span className={`dialer-q-dot ${tone}`} />
                      <span className="dialer-q-copy">
                        <b>{lead.name}</b>
                        <i>
                          {lead.city || "—"} · {lead.attempts}×
                        </i>
                      </span>
                    </>
                  )}
                </button>
              );
            })}
            {!queue.length ? <div className="dialer-empty">No callable leads.</div> : null}
          </div>
        </aside>

        <section className={`dialer-well tone-${stageTone} ${scriptMode === "focus" ? "compact" : ""}`}>
          {active ? (
            <>
              <div className="call-stage">
                <div className="call-identity">
                  <span className={`call-state ${stamp.tone}`}>{stamp.label}</span>
                  <h2 className="call-name">{active.name}</h2>
                  <div className="dial-phone">
                    {phonePretty(active.phone)}
                    {pad ? <span className="dial-pad-echo"> · {pad}</span> : null}
                  </div>
                  <div className="call-sub">
                    {active.property}
                    {active.city ? ` · ${active.city}` : ""}
                    {power ? ` · ${remaining} remaining` : ""}
                  </div>
                  {scriptMode !== "focus" && state === "ready" ? (
                    <p className="call-goal">
                      <span>Next</span>
                      {active.nextAction || "Open the call and qualify bill + roof"}
                    </p>
                  ) : null}
                  {scriptMode !== "focus" && (live || ringing) ? (
                    <p className="call-live-line">
                      {[
                        active.utility || null,
                        active.monthlyBill ? `$${active.monthlyBill}/mo` : null,
                        design ? `${design.roofAge}y ${design.roofMaterial}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>

                <div className={`call-action ${state === "wrap" ? "is-wrap" : ""}`}>
                  <div className={`call-timer ${live || ringing ? "live" : ""}`}>
                    <div className="az-num">{fmt(seconds)}</div>
                    <div>
                      {live ? "Talk" : state === "ringing" ? "Ring" : state === "dialing" ? "Dial" : state === "wrap" ? "Wrap" : "Clock"}
                    </div>
                  </div>

                  {state !== "wrap" ? (
                    <div className="call-controls">
                      {state === "ready" || state === "failed" ? (
                        <button type="button" className="dial-primary" disabled={!canDial} onClick={startCall}>
                          {canDial ? "Dial" : "Blocked"}
                        </button>
                      ) : null}
                      {ringing ? (
                        <button type="button" className="dial-secondary" onClick={cancelRing}>
                          Cancel
                        </button>
                      ) : null}
                      {live ? (
                        <button type="button" className="dial-primary end" onClick={hangup}>
                          End call
                        </button>
                      ) : null}
                      {live ? (
                        <>
                          <button type="button" className={`dial-secondary ${muted ? "on" : ""}`} onClick={() => setMuted((v) => !v)}>
                            {muted ? "Unmute" : "Mute"}
                          </button>
                          <button
                            type="button"
                            className={`dial-secondary ${state === "hold" ? "on" : ""}`}
                            onClick={() => setState(state === "hold" ? "connected" : "hold")}
                          >
                            {state === "hold" ? "Resume" : "Hold"}
                          </button>
                        </>
                      ) : null}
                      <button type="button" className={`dial-ghost ${showPad ? "on" : ""}`} onClick={() => setShowPad((v) => !v)}>
                        Keypad
                      </button>
                    </div>
                  ) : (
                    <p className="call-wrap-hint">Disposition the call below</p>
                  )}

                  {state !== "wrap" && !canDial ? <BlockNote lead={active} /> : null}
                  {state !== "wrap" && showPad ? (
                    <div className="keypad">
                      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((key) => (
                        <button key={key} type="button" onClick={() => setPad((value) => value + key)}>
                          {key}
                        </button>
                      ))}
                      <p>Local keypad only — no carrier DTMF. Space dials · Esc ends · M mutes.</p>
                    </div>
                  ) : null}
                </div>
              </div>

              {scriptMode !== "focus" && !live && !ringing ? (
                <div className="call-meta">
                  <Fact k="Utility" v={`${active.utility || "—"} · ${active.monthlyBill ? `$${active.monthlyBill}` : "no bill"}`} />
                  <Fact k="Roof" v={design ? `${design.roofAge}y ${design.roofMaterial}` : "—"} />
                  <Fact k="Array" v={estimate ? `${estimate.systemKw} kW · ${estimate.offset}%` : "Unsized"} />
                  <Fact k="Consent" v={eligibility?.label || "—"} />
                </div>
              ) : null}

              <div className={`call-dock ${live || ringing ? "live" : ""}`}>
                <label className="call-notes-label">
                  Notes
                  <textarea
                    className={`az-area call-notes ${scriptMode === "collapsed" && !live ? "" : "slim"}`}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Saved at wrap-up"
                  />
                </label>
                {scriptMode === "collapsed" && !live && !ringing && history.length ? (
                  <div className="call-history">
                    <span className="call-history-label">Recent</span>
                    {history.map((row) => (
                      <div key={row.id}>
                        <b>{row.outcome.replaceAll("_", " ")}</b>
                        <span>{fmt(row.duration)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="dialer-empty stage">Queue is empty.</div>
          )}
        </section>

        {scriptMode !== "collapsed" ? (
          <ScriptPanel lead={active} design={design} beat={beat} onBeat={setBeat} large mode={scriptMode} />
        ) : null}
      </div>

      {state === "wrap" && active ? (
        <>
          <div className="wrap-backdrop" aria-hidden />
          <WrapSheet
            name={active.name}
            seconds={seconds}
            notes={notes}
            onNotes={setNotes}
            defaultDisposition={wrapDefault}
            onSave={applyWrap}
            onSkip={() => {
              setState("ready");
              setSeconds(0);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function SessionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="dialer-stat">
      <span>{label}</span>
      <b className="az-num">{value}</b>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="call-meta-item">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

function BlockNote({ lead }: { lead: Lead }) {
  const reason = lead.dnc ? "Internal DNC. Do not dial." : lead.consent !== "verified" ? "Consent is not verified." : "Phone is not callable.";
  return <p className="call-block">{reason}</p>;
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { leadEligibility, nowIso, phonePretty, uid } from "@/lib/format";
import { estimateFor } from "@/lib/solar";
import { CALL_STATES, DISPOSITIONS, type DialState, type DispositionId } from "@/lib/dispositions";
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
  const powerRef = useRef(false);
  const connectedRef = useRef(false);
  powerRef.current = power;

  const queue = useMemo(() => {
    return workspace.leads
      .filter((lead) => !lead.dnc)
      .sort((a, b) => Number(b.priority === "Critical") - Number(a.priority === "Critical"));
  }, [workspace.leads]);

  const active = workspace.leads.find((lead) => lead.id === selectedLeadId) || queue[0] || null;
  const design = active ? workspace.designs?.[active.id] : null;
  const estimate = active && design ? estimateFor(active, design) : null;
  const eligibility = active ? leadEligibility(active) : null;
  const canDial = eligibility?.tone === "ok";
  const remaining = queue.filter((lead) => leadEligibility(lead).tone === "ok" && lead.id !== active?.id).length;
  const live = state === "connected" || state === "hold" || state === "muted";
  const visual: DialState = live && muted ? "muted" : state;
  const stamp = CALL_STATES[visual];
  const history = (workspace.callLogs || []).filter((row) => row.leadId === active?.id).slice(0, 5);

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
    const id = window.setTimeout(() => {
      connectedRef.current = true;
      setState("connected");
      setBeat(1);
      setSession((prev) => ({ ...prev, answered: prev.answered + 1 }));
    }, 1600);
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
    setState("wrap");
    setMuted(false);
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
      const next = {
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
                ...prev.callbacks,
              ]
            : prev.callbacks,
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
      return next;
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

  if (loading) return <div className="text-[var(--muted)]">Opening the dialer…</div>;

  const answerRate = session.attempts ? Math.round((session.answered / session.attempts) * 100) : 0;
  const setRate = session.attempts ? Math.round((session.appointments / session.attempts) * 100) : 0;

  return (
    <div className="dialer-desk">
      <header className="dialer-bar">
        <div className="dialer-stats">
          <Stat k="Attempted" v={`${session.attempts}`} />
          <Stat k="Answered" v={`${session.answered}`} />
          <Stat k="Answer" v={`${answerRate}%`} />
          <Stat k="Talk" v={fmt(session.talkSec)} />
          <Stat k="Sets" v={`${session.appointments}`} />
          <Stat k="Set rate" v={`${setRate}%`} />
          <Stat k="No answer" v={`${session.noAnswer}`} />
          <Stat k="Queue" v={`${remaining}`} />
        </div>
        <div className="dialer-bar-actions">
          <button type="button" className={`az-btn ${power ? "pri" : ""}`} onClick={() => setPower((v) => !v)}>
            {power ? "Power · on" : "Power dial"}
          </button>
          <AudioPopover />
          <div className="script-mode">
            {(["collapsed", "split", "focus"] as const).map((item) => (
              <button key={item} type="button" className={scriptMode === item ? "on" : ""} onClick={() => setScriptMode(item)}>
                {item === "collapsed" ? "Call" : item === "split" ? "Split" : "Script"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={`dialer-body ${scriptMode}`}>
        <section className="dialer-queue az-panel">
          <div className="dialer-queue-head">
            <span>{power ? "Power" : "Queue"}</span>
            <span className="az-num">{queue.length}</span>
          </div>
          <div className="scroll-y flex-1">
            {queue.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => pick(lead.id)}
                className={`dialer-q-row ${active?.id === lead.id ? "on" : ""}`}
                title={lead.name}
              >
                {scriptMode === "focus" ? (
                  <b>{lead.name.split(" ").map((part) => part[0]).join("")}</b>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <b>{lead.name}</b>
                      <span className={`az-chip ${leadEligibility(lead).tone}`}>{leadEligibility(lead).label}</span>
                    </div>
                    <div className="meta">
                      {lead.city} · {lead.attempts}×
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>
        </section>

        <section className={`dialer-well ${scriptMode === "focus" ? "compact" : ""}`}>
            {active ? (
              <>
                <div className="call-head">
                <div className="call-hud">
                  <div className="min-w-0">
                    <span className={`call-state ${stamp.tone}`}>{stamp.label}</span>
                    <h2 className="call-name">{active.name}</h2>
                    <div className="dial-phone">{phonePretty(active.phone)}{pad ? ` · ${pad}` : ""}</div>
                    <div className="call-sub">
                      {active.property} · {active.city}
                      {power ? ` · ${remaining} remaining` : ""}
                    </div>
                  </div>
                  <div className={`call-timer ${live || state === "dialing" || state === "ringing" ? "live" : ""}`}>
                    <div className="az-num">{fmt(seconds)}</div>
                    <div>{live ? "Talk" : state === "ringing" ? "Ring" : "Clock"}</div>
                  </div>
                </div>

                {scriptMode !== "focus" ? (
                  <div className="call-facts">
                    <Fact k="Utility / bill" v={`${active.utility} · ${active.monthlyBill ? `$${active.monthlyBill}` : "—"}`} />
                    <Fact k="Roof" v={design ? `${design.roofAge}y ${design.roofMaterial}` : "—"} />
                    <Fact k="Array" v={estimate ? `${estimate.systemKw} kW · ${estimate.offset}% offset` : "Unsized"} />
                    <Fact k="Next" v={active.nextAction || "—"} />
                  </div>
                ) : null}
                </div>

                {scriptMode === "collapsed" ? (
                  <textarea className="az-area call-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Live notes — saved at wrap-up" />
                ) : (
                  <textarea className="az-area call-notes slim" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" />
                )}

                <div className="call-foot">
                <div className="call-controls">
                  {state === "ready" || state === "failed" ? (
                    <button type="button" className="az-btn pri" disabled={!canDial} onClick={startCall}>
                      {canDial ? "Dial" : "Blocked"}
                    </button>
                  ) : null}
                  {state === "dialing" || state === "ringing" ? (
                    <button type="button" className="az-btn" onClick={() => setState("failed")}>
                      Cancel
                    </button>
                  ) : null}
                  {live ? (
                    <>
                      <button type="button" className="az-btn danger" onClick={hangup}>
                        End call
                      </button>
                      <button type="button" className={`az-btn ${muted ? "pri" : ""}`} onClick={() => setMuted((v) => !v)}>
                        {muted ? "Unmute" : "Mute"}
                      </button>
                      <button
                        type="button"
                        className={`az-btn ${state === "hold" ? "pri" : ""}`}
                        onClick={() => setState(state === "hold" ? "connected" : "hold")}
                      >
                        {state === "hold" ? "Resume" : "Hold"}
                      </button>
                    </>
                  ) : null}
                  <button type="button" className="az-btn ghost" onClick={() => setShowPad((v) => !v)}>
                    Keypad
                  </button>
                </div>
                {showPad ? (
                  <div className="keypad">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((key) => (
                      <button key={key} type="button" onClick={() => setPad((value) => value + key)}>
                        {key}
                      </button>
                    ))}
                    <p>Local keypad only — no carrier DTMF.</p>
                  </div>
                ) : null}
                {!canDial ? <BlockNote lead={active} /> : null}
                {scriptMode === "collapsed" && history.length ? (
                  <div className="call-history">
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
              <div className="text-[var(--muted)] p-4">Queue is empty.</div>
            )}
          </section>

        {scriptMode !== "collapsed" ? (
          <ScriptPanel lead={active} design={design} beat={beat} onBeat={setBeat} large mode={scriptMode} />
        ) : null}
      </div>

      {state === "wrap" && active ? (
        <WrapSheet
          name={active.name}
          seconds={seconds}
          notes={notes}
          onNotes={setNotes}
          onSave={applyWrap}
          onSkip={() => {
            setState("ready");
            setSeconds(0);
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="dialer-stat">
      <span>{k}</span>
      <b className="az-num">{v}</b>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="k">{k}</div>
      <div className="truncate">{v}</div>
    </div>
  );
}

function BlockNote({ lead }: { lead: Lead }) {
  const reason = lead.dnc ? "Internal DNC. Do not dial." : lead.consent !== "verified" ? "Consent is not verified." : "Phone is not callable.";
  return <p className="text-[11px] text-[var(--down)] px-4">{reason}</p>;
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

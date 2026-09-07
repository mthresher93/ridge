"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/lib/workspace-context";
import { leadEligibility, normalizePhone, nowIso, relativeDue, uid } from "@/lib/format";
import { estimateFor } from "@/lib/solar";
import { CALL_STATES, DISPOSITIONS, visibleCallState, type DialState, type DispositionId } from "@/lib/dispositions";
import { completeOpenCallbacks, syncOpportunityFromWrap } from "@/lib/crm";
import { ScriptPanel } from "./script-panel";
import { AudioPopover } from "./audio-popover";
import { WrapSheet } from "./wrap-sheet";
import { settingsWithDefaults, type Lead } from "@/lib/types";

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
  const prefs = settingsWithDefaults(workspace.settings);
  const [scriptMode, setScriptMode] = useState<ScriptMode>(prefs.defaultScriptMode);
  const [power, setPower] = useState(false);
  const [digits, setDigits] = useState("");
  const [lastDialed, setLastDialed] = useState("");
  const [queueQuery, setQueueQuery] = useState("");
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
      .filter((lead) => !lead.archivedAt && !lead.dnc)
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

  const visibleQueue = useMemo(() => {
    const q = queueQuery.trim().toLowerCase();
    const num = queueQuery.replace(/\D/g, "");
    if (!q) return queue;
    return queue.filter((lead) => {
      const hay = [lead.name, lead.city, lead.property, lead.status, lead.owner].join(" ").toLowerCase();
      if (hay.includes(q)) return true;
      return num ? phoneDigits(lead.phone).includes(num) : false;
    });
  }, [queue, queueQuery]);

  const active = workspace.leads.find((lead) => lead.id === selectedLeadId) || queue[0] || null;
  activeRef.current = active;
  const design = active ? workspace.designs?.[active.id] : null;
  const estimate = active && design ? estimateFor(active, design) : null;
  const eligibility = active ? leadEligibility(active) : null;
  const canDial = eligibility?.tone === "ok";
  const remaining = queue.filter((lead) => leadEligibility(lead).tone === "ok" && lead.id !== active?.id).length;
  const live = state === "connected" || state === "hold" || state === "muted";
  const stamp = CALL_STATES[visibleCallState(state, muted, wrapDefault)];
  const history = (workspace.callLogs || []).filter((row) => row.leadId === active?.id).slice(0, 4);
  const dialTarget = workspace.settings.dialTarget || 80;
  const targetPct = Math.min(100, Math.round((session.attempts / dialTarget) * 100));
  const answerRate = session.attempts ? Math.round((session.answered / session.attempts) * 100) : 0;
  const setRate = session.attempts ? Math.round((session.appointments / session.attempts) * 100) : 0;
  const ringing = state === "dialing" || state === "ringing";
  const stageTone = stamp.tone;
  const openCallback = active ? workspace.callbacks.find((item) => item.leadId === active.id && item.status === "open") : null;
  const nextLead = active ? nextCallable(active.id) : null;
  const avgTalk = session.answered ? Math.round(session.talkSec / session.answered) : 0;

  useEffect(() => {
    if (active) {
      setNotes(active.notes);
      if (stateRef.current === "ready" || stateRef.current === "failed") {
        setDigits(phoneDigits(active.phone));
      }
    }
  }, [active?.id]);

  useEffect(() => {
    const num = digits.replace(/\D/g, "");
    if (num.length !== 10) return;
    if (stateRef.current !== "ready" && stateRef.current !== "failed") return;
    const match = workspace.leads.find((lead) => phoneDigits(lead.phone) === num);
    if (match && match.id !== selectedLeadId) setSelectedLeadId(match.id);
  }, [digits, workspace.leads, selectedLeadId]);

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
    setDigits(phoneDigits(workspace.leads.find((lead) => lead.id === id)?.phone || ""));
  }

  function startCall() {
    if (!active || !canDial) return;
    if (prefs.confirmBeforeDial && !powerRef.current && !window.confirm(`Call ${active.name}?`)) return;
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
    setLastDialed(digits || phoneDigits(active.phone));
    log("lead", active.id, "dial_attempt", digits ? `Dial started · ${digits}` : "Dial started");
  }

  function hangup() {
    if (live) setSession((prev) => ({ ...prev, talkSec: prev.talkSec + seconds }));
    setWrapDefault("qualified_lead");
    setState("wrap");
    setMuted(false);
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

  function applyWrap(id: DispositionId, when?: string, advance?: boolean, nextAction?: string) {
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
                nextAction: nextAction?.trim() || defaultNextAction(id, when),
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
                  reason: notes || "Callback from disposition",
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
    const nxt = advance || powerRef.current ? nextCallable(active.id) : null;
    if (nxt) {
      setSelectedLeadId(nxt.id);
      setNotes(nxt.notes);
      if (powerRef.current) setAutoDial(true);
    }
  }

  useEffect(() => {
    if (!autoDial) return;
    const id = window.setTimeout(() => {
      setAutoDial(false);
      startCall();
    }, Math.max(0.3, prefs.powerDelaySec) * 1000);
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
      if (/^[0-9*#]$/.test(event.key)) {
        event.preventDefault();
        setDigits((value) => (value + event.key).slice(0, 16));
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        setDigits((value) => value.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) return <div className="cd-body text-[var(--tx4)]">Opening the dialer…</div>;

  return (
    <div className={`dl dl-${scriptMode} tone-${stageTone}`}>
      <header className="dl-bar">
        <div className="dl-stats" title={`Avg talk ${fmt(avgTalk)} · Set ${setRate}% · No answer ${session.noAnswer} · Voicemail ${session.voicemail} · Follow-ups ${session.followUps}`}>
          <Stat k="Dials" v={`${session.attempts}`} />
          <Stat k="Answered" v={`${session.answered}`} />
          <Stat k="Answer" v={`${answerRate}%`} />
          <Stat k="Talk" v={fmt(session.talkSec + (live ? seconds : 0))} />
          <Stat k="Sits" v={`${session.appointments}`} />
          <div className="dl-pace" title={`${targetPct}% of daily dial target`}>
            <span>
              Pace <b className="az-num">{session.attempts}/{dialTarget}</b>
            </span>
            <i>
              <i style={{ width: `${targetPct}%` }} />
            </i>
          </div>
        </div>
        <div className="dl-tools">
          <button type="button" className={`az-btn sm ${power ? "pri" : ""}`} onClick={() => setPower((v) => !v)}>
            {power ? "Power on" : "Power"}
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

      <aside className="dl-queue">
        <div className="dl-queue-head">
          <div>
            <span className={`dl-queue-state ${power ? "on" : ""}`}>{power ? "Power · active" : "Queue · paused"}</span>
            <b className="az-num">{remaining} left</b>
          </div>
          <button type="button" className={`rail-filter ${callableOnly ? "on" : ""}`} onClick={() => setCallableOnly((v) => !v)}>
            {callableOnly ? "Callable" : "All"}
          </button>
        </div>
        <input
          className="az-input dl-queue-search"
          placeholder="Find name or number"
          value={queueQuery}
          onChange={(event) => setQueueQuery(event.target.value)}
          aria-label="Search queue"
        />
        <div className="scroll-y flex-1">
          {visibleQueue.map((lead) => {
            const tone = leadEligibility(lead).tone;
            const isNext = nextLead?.id === lead.id;
            return (
              <button
                key={lead.id}
                type="button"
                onClick={() => pick(lead.id)}
                className={`dialer-q-row ${active?.id === lead.id ? "on" : ""} ${isNext ? "next" : ""}`}
                title={`${lead.name} · ${lead.city}`}
              >
                {scriptMode !== "collapsed" ? (
                  <b className="dialer-q-initials">{lead.name.split(" ").map((part) => part[0]).join("")}</b>
                ) : (
                  <>
                    <span className={`dialer-q-dot ${tone}`} />
                    <span className="dialer-q-copy">
                      <b>{lead.name}</b>
                      <i>
                        {lead.city || "—"} · {lead.attempts}×{isNext ? " · next" : ""}
                      </i>
                    </span>
                  </>
                )}
              </button>
            );
          })}
          {!visibleQueue.length ? <div className="dialer-empty">{queue.length ? "No matches in queue." : "Queue is empty."}</div> : null}
        </div>
      </aside>

      <section className={`dl-stage ${live ? "is-live" : ringing ? "is-ring" : state === "wrap" ? "is-wrap" : ""}`}>
        {active ? (
          <>
            <div className="dl-hero">
              <div className="dl-hero-top">
                <div className={`dl-state ${stamp.tone}`}>
                  <i />
                  {stamp.label}
                </div>
                <div className={`dl-timer ${live ? "live" : ringing ? "progress" : ""}`}>
                  <b className="az-num">{fmt(seconds)}</b>
                  {live || ringing || state === "wrap" ? (
                    <span>{live ? "talk" : ringing ? "ring" : "ended"}</span>
                  ) : null}
                </div>
              </div>
              <h2 className="dl-name">{active.name}</h2>
              <div className="dl-sub">
                {active.property || "No property"}
                {active.city ? ` · ${active.city}` : ""}
                {` · attempt ${active.attempts || 1}`}
              </div>
              {state !== "wrap" && !canDial ? <BlockNote lead={active} /> : null}
            </div>

            {state !== "wrap" ? (
              <div className="dl-desk">
                <div className="dl-phone-desk">
                  <DialPad
                    digits={digits}
                    live={live || ringing}
                    onDigit={(key) => setDigits((value) => (value + key).slice(0, 16))}
                    onBackspace={() => setDigits((value) => value.slice(0, -1))}
                    onClear={() => setDigits(phoneDigits(active.phone))}
                  />
                  <div className="dl-buttons">
                    {state === "ready" || state === "failed" ? (
                      <button type="button" className="dl-primary" disabled={!canDial || digits.replace(/\D/g, "").length < 7} onClick={startCall}>
                        {canDial ? "Dial" : "Blocked"}
                        <small>Space</small>
                      </button>
                    ) : null}
                    {ringing ? (
                      <button type="button" className="dl-primary end" onClick={cancelRing}>
                        Cancel
                        <small>Esc</small>
                      </button>
                    ) : null}
                    {live ? (
                      <button type="button" className="dl-primary end" onClick={hangup}>
                        End call
                        <small>Esc</small>
                      </button>
                    ) : null}
                    <div className="dl-secondary-row">
                      {live ? (
                        <>
                          <button type="button" className={`dl-secondary ${muted ? "on" : ""}`} onClick={() => setMuted((v) => !v)}>
                            {muted ? "Unmute" : "Mute"}
                          </button>
                          <button
                            type="button"
                            className={`dl-secondary ${state === "hold" ? "on" : ""}`}
                            onClick={() => setState(state === "hold" ? "connected" : "hold")}
                          >
                            {state === "hold" ? "Resume" : "Hold"}
                          </button>
                        </>
                      ) : null}
                      {!live && !ringing && lastDialed ? (
                        <button type="button" className="dl-secondary ghost" onClick={() => setDigits(lastDialed)}>
                          Redial
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="dl-secondary ghost"
                        onClick={() => {
                          void navigator.clipboard?.writeText(digits || active.phone);
                        }}
                      >
                        Copy
                      </button>
                      {!live && !ringing && nextLead ? (
                        <button type="button" className="dl-secondary ghost" onClick={() => pick(nextLead.id)}>
                          Skip → {nextLead.name.split(" ")[0]}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="dl-side">
                  {!live && !ringing ? (
                    <div className="dl-next">
                      <span>Next action</span>
                      <b>{active.nextAction || "Open the call and qualify bill + roof"}</b>
                      {openCallback ? <em>Callback {relativeDue(openCallback.dueAt)}</em> : null}
                    </div>
                  ) : null}
                  <label className={`dl-notes ${live ? "live" : ""}`}>
                    <span>Notes</span>
                    <textarea className="az-area" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What did they say?" />
                  </label>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="dialer-empty stage">Queue is empty.</div>
        )}
      </section>

      {scriptMode === "collapsed" && active ? (
        <aside className="dl-context">
          <div className="dl-ctx-head">Lead details</div>
          <dl className="dl-facts">
            <Fact k="Utility" v={active.utility || "—"} />
            <Fact k="Bill" v={active.monthlyBill ? `$${active.monthlyBill}/mo` : "unknown"} />
            <Fact k="Roof" v={design ? `${design.roofAge}y ${design.roofMaterial}` : "not surveyed"} />
            <Fact k="Array" v={estimate ? `${estimate.systemKw} kW · ${estimate.offset}% offset` : "unsized"} />
            <Fact k="Consent" v={eligibility?.label || "—"} />
            <Fact k="Stage" v={active.status} />
          </dl>
          <div className="dl-ctx-head">History</div>
          <div className="dl-history">
            {history.length === 0 ? <p>No calls logged yet.</p> : null}
            {history.map((row) => (
              <div key={row.id}>
                <b>{row.outcome.replaceAll("_", " ")}</b>
                <span className="az-num">{fmt(row.duration)}</span>
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {scriptMode !== "collapsed" ? (
        <ScriptPanel lead={active} design={design} beat={beat} onBeat={setBeat} large mode={scriptMode} />
      ) : null}

      {state === "wrap" && active ? (
        <>
          <div className="wrap-backdrop" aria-hidden />
          <WrapSheet
            name={active.name}
            nextName={nextLead?.name}
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

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <span className="dl-stat">
      <span>{k}</span>
      <b className="az-num">{v}</b>
    </span>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="dl-fact">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function BlockNote({ lead }: { lead: Lead }) {
  const reason = lead.dnc ? "Internal DNC. Do not dial." : lead.consent !== "verified" ? "Consent is not verified." : "Phone is not callable.";
  return <p className="dl-block">{reason}</p>;
}

function defaultNextAction(id: DispositionId, when?: string) {
  const at = when ? new Date(when).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "";
  switch (id) {
    case "appointment_set":
      return `Confirm sit ${at} · both signers · bring bill`;
    case "callback_scheduled":
      return `Call back ${at}`;
    case "qualified_lead":
      return "Send design and book the sit";
    case "no_answer":
    case "busy":
      return "Retry in the West Coast window";
    case "voicemail":
      return "Retry tomorrow · second voicemail max";
    case "not_interested":
    case "disqualified":
    case "wrong_number":
      return "Closed — no further calls";
    case "dnc":
      return "Do not call";
    default:
      return "Review";
  }
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function phoneDigits(phone: string) {
  return normalizePhone(phone).replace(/^\+1/, "").replace(/\D/g, "");
}

function formatDialDigits(value: string) {
  const raw = value.replace(/\D/g, "");
  if (raw.length === 10) return `(${raw.slice(0, 3)}) ${raw.slice(3, 6)}-${raw.slice(6)}`;
  if (raw.length === 11 && raw.startsWith("1")) return `(${raw.slice(1, 4)}) ${raw.slice(4, 7)}-${raw.slice(7)}`;
  return value;
}

const PAD_KEYS: { key: string; letters: string }[] = [
  { key: "1", letters: "" },
  { key: "2", letters: "ABC" },
  { key: "3", letters: "DEF" },
  { key: "4", letters: "GHI" },
  { key: "5", letters: "JKL" },
  { key: "6", letters: "MNO" },
  { key: "7", letters: "PQRS" },
  { key: "8", letters: "TUV" },
  { key: "9", letters: "WXYZ" },
  { key: "*", letters: "" },
  { key: "0", letters: "+" },
  { key: "#", letters: "" },
];

function DialPad({
  digits,
  live,
  onDigit,
  onBackspace,
  onClear,
}: {
  digits: string;
  live: boolean;
  onDigit: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}) {
  return (
    <div className="dl-pad" aria-label="Dial pad">
      <div className="dl-pad-readout" aria-live="polite">
        {formatDialDigits(digits) || "Enter number"}
      </div>
      <div className="dl-pad-grid">
        {PAD_KEYS.map((item) => (
          <button key={item.key} type="button" onClick={() => onDigit(item.key)}>
            <b>{item.key}</b>
            {item.letters ? <i>{item.letters}</i> : <i>&nbsp;</i>}
          </button>
        ))}
      </div>
      <div className="dl-pad-tools">
        <button type="button" onClick={onBackspace} disabled={!digits} aria-label="Delete last digit">
          Delete
        </button>
        <button type="button" onClick={onClear} disabled={!digits} aria-label="Reset to record number">
          Reset
        </button>
      </div>
      <p>{live ? "Local digits only — no carrier DTMF." : "Tap or type. A 10-digit match opens that record."}</p>
    </div>
  );
}

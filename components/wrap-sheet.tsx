"use client";

import { useEffect, useState } from "react";
import { DISPOSITIONS, type DispositionId } from "@/lib/dispositions";

export function WrapSheet({
  name,
  seconds,
  notes,
  onNotes,
  onSave,
  onSkip,
  defaultDisposition = "no_answer",
}: {
  name: string;
  seconds: number;
  notes: string;
  onNotes: (value: string) => void;
  onSave: (id: DispositionId, when?: string, advance?: boolean) => void;
  onSkip: () => void;
  defaultDisposition?: DispositionId;
}) {
  const [picked, setPicked] = useState<DispositionId>(defaultDisposition);
  const [when, setWhen] = useState(defaultWhen);
  const needsWhen = picked === "callback_scheduled" || picked === "appointment_set";

  useEffect(() => {
    setPicked(defaultDisposition);
  }, [defaultDisposition]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onSave(picked, when, true);
        return;
      }
      const index = Number(event.key);
      if (event.key === "0") {
        event.preventDefault();
        setPicked(DISPOSITIONS[9]?.id || DISPOSITIONS[DISPOSITIONS.length - 1].id);
        return;
      }
      if (index >= 1 && index <= Math.min(9, DISPOSITIONS.length)) {
        event.preventDefault();
        setPicked(DISPOSITIONS[index - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, when, onSave, onSkip]);

  return (
    <div className="wrap-sheet" role="dialog" aria-label="Post-call wrap-up">
      <div className="wrap-sheet-bar">
        <div>
          <div className="az-kicker">Wrap-up</div>
          <div className="text-[15px] font-semibold">
            {name} · {fmt(seconds)}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">1–9 / 0 pick · Enter save+next · Esc skip</div>
        </div>
        <button type="button" className="az-btn ghost" onClick={onSkip}>
          Skip
        </button>
      </div>
      <div className="wrap-grid">
        {DISPOSITIONS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`wrap-pick ${picked === item.id ? "on" : ""}`}
            onClick={() => setPicked(item.id)}
          >
            <span className="wrap-hotkey">{index === 9 ? 0 : index + 1}</span>
            {item.label}
          </button>
        ))}
      </div>
      {needsWhen ? (
        <label className="block text-[11px] text-[var(--muted)]">
          {picked === "appointment_set" ? "Appointment time" : "Callback time"}
          <input type="datetime-local" className="az-input mt-1" value={when} onChange={(event) => setWhen(event.target.value)} />
        </label>
      ) : null}
      <textarea className="az-area" rows={3} value={notes} onChange={(event) => onNotes(event.target.value)} placeholder="Call notes" />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="az-btn pri" onClick={() => onSave(picked, when, true)}>
          Save + next lead
        </button>
        <button type="button" className="az-btn" onClick={() => onSave(picked, when, false)}>
          Save
        </button>
      </div>
    </div>
  );
}

function defaultWhen() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fmt(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

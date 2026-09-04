"use client";

import { useState } from "react";
import { DISPOSITIONS, type DispositionId } from "@/lib/dispositions";

export function WrapSheet({
  name,
  seconds,
  notes,
  onNotes,
  onSave,
  onSkip,
}: {
  name: string;
  seconds: number;
  notes: string;
  onNotes: (value: string) => void;
  onSave: (id: DispositionId, when?: string, advance?: boolean) => void;
  onSkip: () => void;
}) {
  const [picked, setPicked] = useState<DispositionId>("no_answer");
  const [when, setWhen] = useState(defaultWhen);
  const needsWhen = picked === "callback_scheduled" || picked === "appointment_set";

  return (
    <div className="wrap-sheet" role="dialog" aria-label="Post-call wrap-up">
      <div className="wrap-sheet-bar">
        <div>
          <div className="az-kicker">Wrap-up</div>
          <div className="text-[15px] font-semibold">
            {name} · {fmt(seconds)}
          </div>
        </div>
        <button type="button" className="az-btn ghost" onClick={onSkip}>
          Skip
        </button>
      </div>
      <div className="wrap-grid">
        {DISPOSITIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`wrap-pick ${picked === item.id ? "on" : ""}`}
            onClick={() => setPicked(item.id)}
          >
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

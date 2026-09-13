"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FlowState, FlowStepId } from "@/lib/flow";

export function DeskFlow({
  flow,
  onStay,
}: {
  flow: FlowState;
  onStay?: (id: FlowStepId) => void;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState<FlowStepId | null>(null);
  const active = flow.steps.find((item) => item.id === (focus || flow.current)) || flow.steps[0];
  const currentIndex = flow.steps.findIndex((item) => item.id === flow.current);

  function go(id: FlowStepId) {
    const step = flow.steps.find((item) => item.id === id);
    if (!step) return;
    if (step.stay) {
      onStay?.(id);
      return;
    }
    router.push(step.href);
  }

  return (
    <section className="desk-flow" aria-label="Job map">
      <header className="desk-flow-head">
        <div>
          <div className="home-kicker">How a load moves</div>
          <p className="desk-flow-line">
            <b>{active.label}</b>
            <span>{active.hint}</span>
          </p>
        </div>
      </header>
      <ol className="desk-flow-rail">
        {flow.steps.map((step, index) => {
          const state = step.id === flow.current ? "now" : index < currentIndex ? "done" : step.count ? "wait" : "idle";
          return (
            <li key={step.id} className={`desk-flow-step is-${state}${focus === step.id ? " is-focus" : ""}`}>
              {index > 0 ? <span className={`desk-flow-wire${index <= currentIndex ? " on" : ""}`} aria-hidden /> : null}
              <button
                type="button"
                onClick={() => go(step.id)}
                onMouseEnter={() => setFocus(step.id)}
                onMouseLeave={() => setFocus(null)}
                onFocus={() => setFocus(step.id)}
                onBlur={() => setFocus(null)}
              >
                <em>{step.n}</em>
                <strong>{step.label}</strong>
                <span>{step.count ? step.count : step.id === "hunt" ? "Go" : "—"}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

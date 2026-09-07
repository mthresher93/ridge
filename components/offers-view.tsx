"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const PACKS = [
  { name: "Lumen 6", size: "6.6 kW", range: "$16.4–19.8k", fit: "Bills $140–$220 · simple roof", outcome: "Flatten the bill without a reroof surprise." },
  { name: "Meridian 10", size: "9.8–10.4 kW", range: "$24–31k", fit: "Bills $220–$380 · south/west", outcome: "Offset the usage you already pay for." },
  { name: "Estate + storage", size: "13 kW + 10 kWh", range: "$38–52k", fit: "TOU + outage anxiety", outcome: "Keep lights and the bill under one plan." },
];

export function OffersView() {
  const router = useRouter();
  const [pack, setPack] = useState(0);
  const [dream, setDream] = useState(8);
  const [likely, setLikely] = useState(74);
  const [days, setDays] = useState(21);
  const [effort, setEffort] = useState<"low" | "med" | "high">("low");
  const [guarantee, setGuarantee] = useState("");
  const [pain, setPain] = useState("The bill is the pain. Waiting another summer is another year of the same number.");
  const [promise, setPromise] = useState("We size the array against the last twelve months, not a brochure. If it does not beat the bill, we say so.");
  const [speed, setSpeed] = useState("Survey in days. Sit with both signers. Paper the same week if the heading holds.");
  const active = PACKS[pack];

  const score = useMemo(() => {
    const effortMult = effort === "low" ? 0.7 : effort === "med" ? 1 : 1.35;
    const raw = ((dream * 10 * (likely / 100)) / ((days / 30 + 0.35) * effortMult)) * (guarantee.trim() ? 1.18 : 0.82);
    return Math.max(1.2, Math.min(9.8, Math.round(raw * 10) / 10));
  }, [dream, likely, days, effort, guarantee]);

  const critic = [
    { tone: "ok" as const, t: "Dream outcome · clear.", d: `${active.name} promises a bill result, not a panel count.` },
    { tone: likely >= 70 ? ("ok" as const) : ("wn" as const), t: "Perceived likelihood.", d: likely >= 70 ? "Proof can carry this." : "Attach a named household before outreach." },
    { tone: days <= 30 ? ("ok" as const) : ("wn" as const), t: "Speed.", d: days <= 30 ? `${days} days is faster than a 6-week design loop.` : "Time delay is the stall." },
    { tone: guarantee.trim() ? ("ok" as const) : ("cr" as const), t: "Risk reversal.", d: guarantee.trim() ? "Guarantee is written. Keep exclusions honest." : "Missing. Add a bill-or-walk guarantee or this offer stalls at price." },
    { tone: effort === "high" ? ("wn" as const) : ("ok" as const), t: "Effort.", d: effort === "high" ? "Too much buyer work. Cut the homework." : "Buyer effort is light enough to sit." },
  ];

  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>Offers</h1>
          <p>Score the package before you write more copy.</p>
        </div>
        <button className="az-btn pri sm" type="button" onClick={() => router.push("/proof")}>
          Attach proof
        </button>
      </header>

      <div className="desk-body">
      <div className="offers-grid">
        <div>
          <div className="cd-glass" style={{ padding: "16px 18px", marginBottom: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 14 }}>
            <div>
              <div className="cd-mono">Editing</div>
              <div style={{ fontFamily: "var(--fh)", fontSize: 18, letterSpacing: "0.06em", marginTop: 4 }}>
                {active.name} · <em style={{ fontFamily: "var(--fs)", fontStyle: "italic", color: "var(--cy)", fontSize: 22 }}>{active.size}</em>
              </div>
              <div className="cd-mono" style={{ marginTop: 4 }}>
                {active.fit} · {active.range}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PACKS.map((item, index) => (
                <button key={item.name} type="button" className={`az-btn sm ${pack === index ? "pri" : ""}`} onClick={() => setPack(index)}>
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <div className="cd-glass offer-eq" style={{ marginBottom: 14 }}>
            <div className="cd-mono">Value equation · Hormozi</div>
            <div className="eq-formula">
              <div className="eq-box">
                <div className="k">+{dream * 5}%</div>
                <div className="l">Dream outcome</div>
              </div>
              <div className="eq-op">×</div>
              <div className="eq-box">
                <div className="k">{likely}%</div>
                <div className="l">Perceived likelihood</div>
              </div>
              <div className="eq-op">÷</div>
              <div className="eq-box">
                <div className="k">{days}d</div>
                <div className="l">Time delay</div>
              </div>
              <div className="eq-op">÷</div>
              <div className="eq-box">
                <div className="k">{effort}</div>
                <div className="l">Effort & sacrifice</div>
              </div>
            </div>
            <div className="eq-result">
              <div>
                <div className="cd-mono">Computed value score</div>
                <div style={{ color: "var(--tx2)", fontSize: 12, marginTop: 3 }}>
                  {guarantee.trim() ? "Risk reversal is written." : "Strong on speed, weak on risk reversal."}
                </div>
              </div>
              <div className="big">{score.toFixed(1)} / 10</div>
            </div>
            <div className="offer-sliders">
              <label>
                Dream 1–10
                <input type="range" min={1} max={10} value={dream} onChange={(e) => setDream(Number(e.target.value))} />
              </label>
              <label>
                Likelihood
                <input type="range" min={20} max={99} value={likely} onChange={(e) => setLikely(Number(e.target.value))} />
              </label>
              <label>
                Days to result
                <input type="range" min={3} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} />
              </label>
              <label>
                Buyer effort
                <select className="az-select" value={effort} onChange={(e) => setEffort(e.target.value as typeof effort)}>
                  <option value="low">Low</option>
                  <option value="med">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
            </div>
          </div>

          <div className="offer-canvas">
            <article className="oc-card cd-glass">
              <div className="lbl">Painful problem</div>
              <textarea className="az-area" rows={4} value={pain} onChange={(e) => setPain(e.target.value)} />
            </article>
            <article className="oc-card cd-glass">
              <div className="lbl">Promised outcome</div>
              <textarea className="az-area" rows={4} value={promise} onChange={(e) => setPromise(e.target.value)} />
            </article>
            <article className="oc-card cd-glass">
              <div className="lbl">Speed & effort</div>
              <textarea className="az-area" rows={4} value={speed} onChange={(e) => setSpeed(e.target.value)} />
            </article>
            <article className="oc-card cd-glass">
              <div className="lbl">Risk reversal</div>
              <textarea
                className="az-area"
                rows={4}
                placeholder='If this array does not beat the recorded bill in year one, we unwind.'
                value={guarantee}
                onChange={(e) => setGuarantee(e.target.value)}
              />
            </article>
          </div>
        </div>

        <aside className="cd-glass critic-panel">
          <div className="cd-mono" style={{ color: "var(--vi)" }}>
            Offer critic
          </div>
          <div style={{ fontFamily: "var(--fh)", letterSpacing: "0.12em", textTransform: "uppercase", margin: "6px 0 12px" }}>
            Verdict
          </div>
          <div className="critic-score">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="cd-mono">Grand Slam score</span>
              <span style={{ fontFamily: "var(--fh)", fontSize: 26, color: "var(--cy)" }}>{score.toFixed(1)}</span>
            </div>
            <div className="score-bar">
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} className={i < Math.round(score) ? "on" : ""} />
              ))}
            </div>
            <div className="cd-mono" style={{ marginTop: 8 }}>
              {score >= 8.5 ? "Irresistible enough to sit." : score >= 7 ? "Good. Not yet irresistible." : "Do not take this to market."}
            </div>
          </div>
          {critic.map((item) => (
            <div key={item.t} className={`critic-item ${item.tone}`}>
              <b>{item.t}</b> {item.d}
            </div>
          ))}
          <p className="cd-mono" style={{ marginTop: 12 }}>
            {active.outcome}
          </p>
        </aside>
      </div>
      </div>
    </div>
  );
}

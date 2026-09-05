"use client";

import { PageDesk } from "./page-desk";

const OFFERS = [
  { name: "Meridian 6", size: "6.6 kW", range: "$16.4–19.8k", fit: "Bills $140–$220 · simple roof" },
  { name: "Meridian 10", size: "9.8–10.4 kW", range: "$24–31k", fit: "Bills $220–$380 · south/west" },
  { name: "Estate + storage", size: "13 kW + 10 kWh", range: "$38–52k", fit: "TOU + outage anxiety" },
];

const PROOF = [
  { who: "Fresno bungalow", result: "$268 → $41", note: "10.2 kW, 26 modules, 47 days to PTO" },
  { who: "Henderson two-story", result: "Peak −62%", note: "West plane + 10 kWh. Same-night sit." },
  { who: "Sacramento ranch", result: "$198 flattened", note: "Co-signer delay. Still signed." },
];

const TRACKS = [
  { objection: "Wait for a rebate.", line: "The rebate is already in the price. Waiting is another year of the same bill." },
  { objection: "The roof is old.", line: "Then we price the reroof as a line, not a surprise." },
  { objection: "I need my spouse.", line: "Correct. We don’t close half a household. Both signers on the sit." },
  { objection: "Solar companies are pushy.", line: "I won’t call twice tonight. Production sheet + a time. If it doesn’t pencil, I’ll say so." },
];

export function PlaybookView() {
  return (
    <PageDesk>
      <div className="az-fill" style={{ gridTemplateRows: "auto auto minmax(0,1fr)" }}>
        <div className="az-title">Playbook</div>
        <div className="playbook-offers">
          {OFFERS.map((offer) => (
            <article key={offer.name} className="playbook-offer">
              <div className="az-kicker">{offer.size}</div>
              <div className="text-[15px] mt-0.5">{offer.name}</div>
              <div className="az-num text-[var(--gold-2)]">{offer.range}</div>
              <p className="text-[11px] text-[var(--muted)] mt-1">{offer.fit}</p>
            </article>
          ))}
        </div>
        <div className="grid grid-cols-[1.1fr_.9fr] gap-2 min-h-0">
          <section className="az-panel overflow-hidden flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-[var(--line)] text-[12px]">When they stall</div>
            <div className="scroll-y flex-1">
              {TRACKS.map((item) => (
                <div key={item.objection} className="px-3 py-2.5 border-b border-[var(--line)] last:border-0">
                  <div className="text-[12px] text-[var(--gold-2)] italic" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>
                    “{item.objection}”
                  </div>
                  <div className="text-[13px] mt-1 leading-snug">{item.line}</div>
                </div>
              ))}
            </div>
          </section>
          <section className="az-panel overflow-hidden flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-[var(--line)] text-[12px]">Proof you can say</div>
            <div className="scroll-y flex-1">
              {PROOF.map((item) => (
                <div key={item.who} className="px-3 py-2.5 border-b border-[var(--line)] last:border-0">
                  <div className="text-[11px] text-[var(--muted)]">{item.who}</div>
                  <div className="text-[16px]">{item.result}</div>
                  <p className="text-[11px] text-[var(--muted)]">{item.note}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PageDesk>
  );
}

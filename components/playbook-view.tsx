"use client";

import { useEffect, useMemo, useState } from "react";
import { PLAYBOOK, searchPlaybook, type PlaybookBlock } from "@/lib/playbook";
import { CALL_ASK, cheaperFails, deckGates, UNIT_PRESETS, applySpecsToLead, parseDimensions, recommendEquipment, specsFromLead, trailerCap, trailerName, type EquipmentFit, type UnitPreset } from "@/lib/equipment";
import { combineUnits, loadedHeight } from "@/lib/freight-math";
import { classifyWhy } from "@/lib/load-class";
import { useWorkspace } from "@/lib/workspace-context";
import { useRouter } from "next/navigation";
import { nowIso } from "@/lib/format";
import { upsertBlankQuote } from "@/lib/freight";

const NAV_GROUPS = [
  { label: "Decide", ids: ["pick", "trailers", "loads", "units"] },
  { label: "Find", ids: ["job", "prospect"] },
  { label: "Ops", ids: ["auctions", "load-unload", "rules", "niches", "boat"] },
];

function num(value: string) {
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) && String(value).trim() ? n : null;
}

function fmt(n: number | null, suffix: string) {
  if (n == null) return "—";
  return suffix === "lb" ? `${n.toLocaleString()} lb` : `${n}${suffix}`;
}

export function PlaybookView() {
  const router = useRouter();
  const { workspace, setWorkspace, selectedLeadId, setSelectedLeadId, log } = useWorkspace();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("pick");
  const [unit, setUnit] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [paste, setPaste] = useState("");
  const [showAllDecks, setShowAllDecks] = useState(false);
  const [fromTraining, setFromTraining] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const liveClients = useMemo(() => workspace.leads.filter((lead) => !lead.archivedAt), [workspace.leads]);
  const targetId = selectedLeadId && liveClients.some((lead) => lead.id === selectedLeadId) ? selectedLeadId : "";

  useEffect(() => {
    const person = workspace.leads.find((lead) => lead.id === targetId);
    if (!person) {
      setSaveMsg("");
      return;
    }
    const specs = specsFromLead(person);
    setUnit(person.equipmentType || "");
    setLength(specs.lengthFt != null ? String(specs.lengthFt) : "");
    setWidth(specs.widthFt != null ? String(specs.widthFt) : "");
    setHeight(specs.heightFt != null ? String(specs.heightFt) : "");
    setWeight(specs.weightLbs != null ? String(specs.weightLbs) : "");
    setPaste("");
    setFromTraining(false);
    setSaveMsg(person.dimensions || person.weight ? `On file: ${person.dimensions || "—"} · ${person.weight ? `${person.weight} lb` : "no weight"}` : "");
  }, [targetId]);

  function saveSpecs() {
    const person = workspace.leads.find((lead) => lead.id === targetId);
    if (!person) {
      setSaveMsg("Pick the yard these numbers belong to.");
      return;
    }
    if (fromTraining) {
      setSaveMsg("Training example. Type the live numbers they told you.");
      return;
    }
    const result = applySpecsToLead(person, {
      unit,
      lengthFt: num(length),
      widthFt: num(width),
      heightFt: num(height),
      weightLbs: num(weight),
    });
    if (!result.saved) {
      setSaveMsg(result.reason);
      return;
    }
    const stamp = nowIso();
    setWorkspace((prev) => ({
      ...prev,
      leads: prev.leads.map((item) => (item.id === person.id ? result.lead : item)),
      updatedAt: stamp,
    }));
    log("lead", person.id, "specs_saved", result.lead.dimensions || "");
    setSaveMsg(`Saved on ${person.name}. ${result.lead.trailerHint}`);
  }

  const sections = useMemo(() => searchPlaybook(query), [query]);
  const active = sections.find((item) => item.id === topic) || sections[0] || PLAYBOOK[0];
  const hasInput = Boolean(unit.trim() || length.trim() || width.trim() || height.trim() || weight.trim() || paste.trim());
  const fit = recommendEquipment({
    text: unit,
    lengthFt: num(length),
    widthFt: num(width),
    heightFt: num(height),
    weightLbs: num(weight),
  });

  function applyPreset(preset: UnitPreset) {
    setUnit(preset.text);
    setLength(String(preset.lengthFt));
    setWidth(String(preset.widthFt));
    setHeight(String(preset.heightFt));
    setWeight(String(preset.weightLbs));
    setPaste("");
    setFromTraining(true);
  }

  return (
    <div className="cd-page fill">
      <div className="az-fill crm-desk">
        <header className="crm-desk-head">
          <div>
            <h1>Intel</h1>
            <p>Type specs from the call. Training buttons are catalog examples, not a live load.</p>
          </div>
        </header>

        <div className="intel-desk">
          <aside className="intel-nav">
            <input className="az-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search trailers, auctions, DOT…" />
            {query.trim()
              ? sections.map((item) => (
                  <button key={item.id} type="button" className={active?.id === item.id ? "on" : ""} onClick={() => setTopic(item.id)}>
                    {item.title}
                  </button>
                ))
              : NAV_GROUPS.map((group) => (
                  <div key={group.label} className="intel-nav-group">
                    <span>{group.label}</span>
                    {group.ids.map((id) => {
                      const item = sections.find((section) => section.id === id);
                      if (!item) return null;
                      return (
                        <button key={item.id} type="button" className={active?.id === item.id ? "on" : ""} onClick={() => setTopic(item.id)}>
                          {item.title}
                        </button>
                      );
                    })}
                  </div>
                ))}
            {sections.length === 0 ? <p className="rec-empty">Nothing matches.</p> : null}
          </aside>

          <div className="intel-main">
            <section className="az-panel freight-panel intel-fit">
              <header>
                <h3>What trailer?</h3>
                <span className="az-chip">{hasInput ? fit.confidence : "—"}</span>
              </header>
              <div className="call-ask-block">
                <div className="home-kicker">Ask these four, then type the numbers</div>
                <ol className="call-ask">
                  {CALL_ASK.map((item) => (
                    <li key={item.id}>{item.ask}</li>
                  ))}
                </ol>
              </div>
              <div className="intel-presets">
                <span className="cd-mono">Training examples — catalog sizes, not a live load</span>
                {UNIT_PRESETS.map((preset) => (
                  <button key={preset.id} type="button" className="az-btn sm" onClick={() => applyPreset(preset)}>
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="intel-fit-grid">
                <label className="rec-field intel-unit">
                  Unit
                  <input
                    className="az-input"
                    value={unit}
                    onChange={(event) => {
                      setFromTraining(false);
                      setUnit(event.target.value);
                    }}
                    placeholder="sleeper cab, mini excavator…"
                  />
                </label>
                <label className="rec-field">
                  Length (ft)
                  <input
                    className="az-input"
                    inputMode="decimal"
                    value={length}
                    onChange={(event) => {
                      setFromTraining(false);
                      setLength(event.target.value);
                    }}
                    placeholder="26"
                  />
                </label>
                <label className="rec-field">
                  Width (ft)
                  <input
                    className="az-input"
                    inputMode="decimal"
                    value={width}
                    onChange={(event) => {
                      setFromTraining(false);
                      setWidth(event.target.value);
                    }}
                    placeholder="8.5"
                  />
                </label>
                <label className="rec-field">
                  Height (ft)
                  <input
                    className="az-input"
                    inputMode="decimal"
                    value={height}
                    onChange={(event) => {
                      setFromTraining(false);
                      setHeight(event.target.value);
                    }}
                    placeholder="10"
                  />
                </label>
                <label className="rec-field">
                  Weight (lb)
                  <input
                    className="az-input"
                    inputMode="numeric"
                    value={weight}
                    onChange={(event) => {
                      setFromTraining(false);
                      setWeight(event.target.value);
                    }}
                    placeholder="18000"
                  />
                </label>
                <label className="rec-field intel-paste">
                  Or paste L × W × H
                  <input
                    className="az-input"
                    value={paste}
                    onChange={(event) => {
                      const next = event.target.value;
                      setFromTraining(false);
                      setPaste(next);
                      const parsed = parseDimensions(next);
                      if (parsed.lengthFt != null) setLength(String(parsed.lengthFt));
                      if (parsed.widthFt != null) setWidth(String(parsed.widthFt));
                      if (parsed.heightFt != null) setHeight(String(parsed.heightFt));
                    }}
                    placeholder="26 x 8.5 x 10 or 312 x 102 x 120 in"
                  />
                </label>
              </div>
              {fromTraining ? <p className="cd-mono">Training example — catalog sizes, not a live load. Type the live numbers to save.</p> : null}
              <div className="intel-save">
                <label className="rec-field">
                  Save onto client
                  <select
                    className="az-select"
                    value={targetId}
                    onChange={(event) => setSelectedLeadId(event.target.value || null)}
                  >
                    <option value="">Pick the yard you just measured</option>
                    {liveClients.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="az-btn pri sm" type="button" onClick={saveSpecs} disabled={!targetId || fromTraining}>
                  Save specs
                </button>
                <button
                  className="az-btn sm"
                  type="button"
                  disabled={!targetId}
                  onClick={() => {
                    const person = workspace.leads.find((lead) => lead.id === targetId);
                    if (!person) {
                      setSaveMsg("Pick the yard these numbers belong to.");
                      return;
                    }
                    const result = upsertBlankQuote(workspace, person);
                    setWorkspace(result.workspace);
                    log("shipment", result.shipment.id, result.created ? "created" : "updated", `Quote from Intel · ${person.name}`);
                    router.push(`/shipments?id=${result.shipment.id}`);
                  }}
                >
                  Use in quote
                </button>
                {saveMsg ? <p className="cd-mono">{saveMsg}</p> : null}
              </div>
              {hasInput ? (
                <>
                  <MatcherResult fit={fit} showAll={showAllDecks} onToggle={() => setShowAllDecks((prev) => !prev)} />
                  <IntelMath fit={fit} length={num(length)} width={num(width)} height={num(height)} weight={num(weight)} />
                </>
              ) : (
                <p className="intel-why">Nothing to match yet. Type what they told you, or paste L × W × H.</p>
              )}
            </section>

            {active ? (
              <article className="az-panel freight-panel intel-article">
                <header>
                  <h3>{active.title}</h3>
                </header>
                <p>{active.blurb}</p>
                {active.blocks.map((block, index) => (
                  <PlaybookBlockView key={`${active.id}-${index}`} block={block} />
                ))}
              </article>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatcherResult({ fit, showAll, onToggle }: { fit: EquipmentFit; showAll: boolean; onToggle: () => void }) {
  const gates = deckGates(fit);
  const skipped = cheaperFails(fit);
  const checks = showAll ? fit.checks : fit.checks.filter((item) => item.code === fit.trailer || skipped.some((row) => row.code === item.code));
  if (fit.trailer === "UNKNOWN") {
    return (
      <div className="intel-result">
        <div className="intel-gates">
          {gates.map((gate) => (
            <div key={gate.id} className={gate.ok === true ? "pass" : gate.ok === false ? "fail" : ""}>
              <b>{gate.label}</b>
              <span>{gate.detail}</span>
            </div>
          ))}
        </div>
        <p className="intel-why">{fit.why}</p>
        <p className="cd-mono">{fit.ask.join(" ")}</p>
      </div>
    );
  }
  return (
    <div className="intel-result">
      <div className="intel-gates">
        {gates.map((gate) => (
          <div key={gate.id} className={gate.ok === true ? "pass" : gate.ok === false ? "fail" : ""}>
            <b>{gate.label}</b>
            <span>{gate.detail}</span>
          </div>
        ))}
      </div>
      <div className="intel-result-hero">
        <div>
          <div className="home-kicker">{fit.usedGuess ? "Catalog estimate — confirm on the call" : "Use this deck"}</div>
          <h4>{fit.trailerName}</h4>
          <p>
            {fit.loadClass}
            {fit.usedGuess ? " · catalog estimate" : ""}
            {" · "}
            {fmt(fit.lengthFt, "'")} L · {fmt(fit.widthFt, "'")} W · {fmt(fit.heightFt, "'")} H · {fmt(fit.weightLbs, "lb")}
          </p>
        </div>
      </div>
      {skipped.length ? (
        <div className="intel-skip">
          <b>Do not use these cheaper decks</b>
          {skipped.map((item) => (
            <p key={item.code}>
              {item.name}: {item.fails[0]}
            </p>
          ))}
        </div>
      ) : fit.trailer === "HS" ? (
        <p className="intel-why">Hotshot still fits. Do not jump to a bigger trailer because it also works.</p>
      ) : null}
      <div className="intel-checks">
        {checks.map((item) => (
          <div key={item.code} className={item.pass ? "pass" : "fail"}>
            <b>
              {item.pass ? "Fits" : "No"} · {item.code}
            </b>
            <span>{item.pass ? item.name : item.fails[0] || item.name}</span>
          </div>
        ))}
      </div>
      <button className="az-btn sm" type="button" onClick={onToggle}>
        {showAll ? "Hide extra decks" : "Show every deck"}
      </button>
      <p className="intel-why">{fit.why}</p>
      {fit.alsoFits.length ? (
        <p className="intel-also">
          Also fits {fit.alsoFits.map((code) => trailerName(code)).join(", ")}. Cheapest legal deck is listed first.
        </p>
      ) : null}
      <p className="intel-legal">{fit.legalNote}</p>
      <p className="cd-mono">{fit.ask.join(" ")}</p>
    </div>
  );
}

function PlaybookBlockView({ block }: { block: PlaybookBlock }) {
  if (block.type === "p") return <p>{block.text}</p>;
  if (block.type === "list") {
    return (
      <ul className="intel-list">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "cards") {
    return (
      <div className="intel-cards">
        {block.items.map((item) => (
          <div key={item.title}>
            {item.meta ? <span className="az-chip gold">{item.meta}</span> : null}
            <b>{item.title}</b>
            <p>{item.body}</p>
          </div>
        ))}
      </div>
    );
  }
  if (block.headers.length > 4) {
    return (
      <div className="intel-spec-grid">
        {block.rows.map((row) => (
          <article key={row.join("|")} className="intel-spec">
            <header>
              <span className="az-chip gold">{row[0]}</span>
              <b>{row[1] || row[0]}</b>
            </header>
            <dl>
              {block.headers.slice(2).map((header, index) => (
                <div key={header}>
                  <dt>{header}</dt>
                  <dd>{row[index + 2] || "—"}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    );
  }
  return (
    <div className="intel-table-wrap">
      <table className="intel-table">
        <thead>
          <tr>
            {block.headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, cellIndex) => (
                <td key={`${row[0]}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IntelMath({
  fit,
  length,
  width,
  height,
  weight,
}: {
  fit: EquipmentFit;
  length: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;
}) {
  const family = fit.trailer === "HS" || fit.trailer === "TILT" ? "hotshot" : "53";
  const klass = classifyWhy(length, weight, family);
  const spec = trailerCap(fit.trailer);
  const heightCheck = height != null && spec?.deckGcFt != null ? loadedHeight(spec.deckGcFt, height) : null;
  const unit =
    length != null && width != null && height != null && weight != null
      ? { lengthFt: length, widthFt: width, heightFt: height, weightLbs: weight }
      : null;
  const combined = unit ? combineUnits([unit, unit], "end-to-end") : null;
  return (
    <div className="intel-math">
      <p className="cd-mono">{klass.why}</p>
      {heightCheck ? <p className="cd-mono">{heightCheck.note}</p> : null}
      {combined ? (
        <p className="cd-mono">
          Two of these end-to-end: {combined.lengthFt}' × {combined.widthFt}' × {combined.heightFt}' · {combined.weightLbs.toLocaleString()} lb
          {combined.warnings[0] ? ` · ${combined.warnings[0]}` : ""}
        </p>
      ) : null}
    </div>
  );
}

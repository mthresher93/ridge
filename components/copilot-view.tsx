"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { answerCopilot } from "@/lib/freight-copilot";

const PROMPTS = [
  "Who should I follow up with today?",
  "Show me all high-score heavy equipment prospects who haven’t been contacted.",
  "Which prospects look like recurring shippers?",
  "What were my best lead sources this month?",
  "How much gross margin did I make this month?",
];

export function CopilotView() {
  const router = useRouter();
  const { workspace, loading, setSelectedLeadId } = useWorkspace();
  const [question, setQuestion] = useState("Who should I follow up with today?");
  const [answer, setAnswer] = useState(() => answerCopilot(workspace, "Who should I follow up with today?"));
  const [provider, setProvider] = useState("rules");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    void ask("Who should I follow up with today?");
  }, [loading]);

  async function ask(text: string) {
    setQuestion(text);
    setBusy(true);
    const local = answerCopilot(workspace, text);
    setAnswer(local);
    setProvider("rules");
    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const json = await res.json();
      if (res.ok && json.answer) {
        setAnswer({ answer: json.answer, matches: json.matches || local.matches });
        setProvider(json.provider || "rules");
      }
    } catch {
      setAnswer(local);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="cd-body text-[var(--tx4)]">Loading workspace…</div>;

  return (
    <div className="cd-page">
      <header className="crm-desk-head">
        <div>
          <h1>AI Copilot</h1>
          <p>Answers come from this workspace. {provider === "rules" ? "Local desk logic." : `Model: ${provider}.`} No invented pipeline numbers.</p>
        </div>
      </header>
      <div className="desk-body">
        <form
          className="follow-add"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <input className="az-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Who should I follow up with today?" />
          <button className="az-btn pri sm" type="submit" disabled={busy}>
            {busy ? "Asking…" : "Ask"}
          </button>
        </form>
        <div className="work-tabs wrap">
          {PROMPTS.map((item) => (
            <button key={item} type="button" className="az-btn sm" onClick={() => void ask(item)}>
              {item}
            </button>
          ))}
        </div>
        <section className="az-panel freight-panel" style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>
          {answer.answer}
        </section>
        {answer.matches.length ? (
          <section className="desk-list">
            {answer.matches.map((item) => (
              <button
                key={item.id}
                type="button"
                className="work-row text-left"
                onClick={() => {
                  setSelectedLeadId(item.id);
                  router.push(`/people?id=${item.id}`);
                }}
              >
                <b>{item.label}</b>
                <span className="cd-mono">Open prospect</span>
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}

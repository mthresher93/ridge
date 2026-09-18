const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3-coder:30b";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "qwen/qwen-2.5-coder-32b-instruct";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";

export type LlmProvider = "ollama" | "openrouter" | "rules";

export type LlmStatus = {
  provider: LlmProvider;
  ready: boolean;
  ollama: { url: string; model: string; ok: boolean; detail: string };
  openrouter: { model: string; ok: boolean; detail: string };
};

async function timedFetch(url: string, init: RequestInit, ms = 90_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function ollamaPing(): Promise<{ ok: boolean; detail: string; models: string[]; model: string }> {
  try {
    const res = await timedFetch(`${OLLAMA_URL}/api/tags`, { method: "GET" }, 4000);
    if (!res.ok) return { ok: false, detail: `Ollama HTTP ${res.status}`, models: [], model: OLLAMA_MODEL };
    const json = (await res.json()) as { models?: { name?: string }[] };
    const models = (json.models || []).map((item) => item.name || "").filter(Boolean);
    const model =
      models.find((name) => name === OLLAMA_MODEL || name.startsWith(`${OLLAMA_MODEL}`)) ||
      models.find((name) => /qwen.*coder/i.test(name)) ||
      models.find((name) => /qwen/i.test(name)) ||
      "";
    if (!models.length) return { ok: false, detail: "Ollama is running but has no models. Run: ollama pull qwen2.5-coder:32b", models, model: OLLAMA_MODEL };
    if (!model) return { ok: false, detail: `Ollama is up. Pull a Qwen model: ollama pull ${OLLAMA_MODEL}`, models, model: OLLAMA_MODEL };
    return { ok: true, detail: `Ollama · ${model}`, models, model };
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError" ? "Ollama timed out" : "Ollama is not running on 11434";
    return { ok: false, detail, models: [], model: OLLAMA_MODEL };
  }
}

export async function llmStatus(): Promise<LlmStatus> {
  const ollama = await ollamaPing();
  const openrouter = {
    model: OPENROUTER_MODEL,
    ok: Boolean(OPENROUTER_KEY),
    detail: OPENROUTER_KEY ? `OpenRouter · ${OPENROUTER_MODEL}` : "No OPENROUTER_API_KEY",
  };
  if (ollama.ok) {
    return {
      provider: "ollama",
      ready: true,
      ollama: { url: OLLAMA_URL, model: ollama.model, ok: true, detail: ollama.detail },
      openrouter,
    };
  }
  if (openrouter.ok) {
    return {
      provider: "openrouter",
      ready: true,
      ollama: { url: OLLAMA_URL, model: OLLAMA_MODEL, ok: false, detail: ollama.detail },
      openrouter,
    };
  }
  return {
    provider: "rules",
    ready: false,
    ollama: { url: OLLAMA_URL, model: OLLAMA_MODEL, ok: false, detail: ollama.detail },
    openrouter,
  };
}

function parseJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function ollamaChat(system: string, user: string, jsonMode = true) {
  const ping = await ollamaPing();
  const model = ping.model || OLLAMA_MODEL;
  const res = await timedFetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: jsonMode ? "json" : undefined,
      options: { temperature: 0.1 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama chat HTTP ${res.status}`);
  const json = (await res.json()) as { message?: { content?: string } };
  return json.message?.content || "";
}

async function openrouterChat(system: string, user: string, jsonMode = true) {
  const res = await timedFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "http://localhost:6793",
      "X-Title": "Haul Freight",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.1,
      response_format: jsonMode ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content || "";
}

export async function llmJson(system: string, user: string): Promise<{ provider: LlmProvider; data: Record<string, unknown> } | null> {
  const status = await llmStatus();
  if (status.provider === "rules") return null;
  try {
    const raw = status.provider === "ollama" ? await ollamaChat(system, user, true) : await openrouterChat(system, user, true);
    const data = parseJsonObject(raw);
    if (!data) return null;
    return { provider: status.provider, data };
  } catch {
    if (status.provider === "ollama" && OPENROUTER_KEY) {
      try {
        const raw = await openrouterChat(system, user, true);
        const data = parseJsonObject(raw);
        if (!data) return null;
        return { provider: "openrouter", data };
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function llmText(system: string, user: string): Promise<{ provider: LlmProvider; text: string } | null> {
  const status = await llmStatus();
  if (status.provider === "rules") return null;
  try {
    const text = status.provider === "ollama" ? await ollamaChat(system, user, false) : await openrouterChat(system, user, false);
    if (!text.trim()) return null;
    return { provider: status.provider, text: text.trim() };
  } catch {
    return null;
  }
}

export function llmConfig() {
  return { ollamaUrl: OLLAMA_URL, ollamaModel: OLLAMA_MODEL, openrouterModel: OPENROUTER_MODEL, openrouter: Boolean(OPENROUTER_KEY) };
}

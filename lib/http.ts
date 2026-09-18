import { NextResponse } from "next/server";

export function logError(scope: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[lumen] ${scope}: ${detail}`);
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export function jsonOk(body: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok: true, ...body }, { status });
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-capture-token",
  };
}

export function corsJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders() });
}

export async function readJson<T>(request: Request): Promise<{ ok: true; body: T } | { ok: false; response: NextResponse }> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 400_000) return { ok: false, response: jsonError("Payload too large", 413) };
  try {
    const body = (await request.json()) as T;
    return { ok: true, body };
  } catch {
    return { ok: false, response: jsonError("JSON body required", 400) };
  }
}

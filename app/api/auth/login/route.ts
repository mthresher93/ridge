import { NextResponse } from "next/server";
import { applySessionCookie, authRequired, passwordMatches } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/http";

export async function GET() {
  return jsonOk({ required: authRequired() });
}

export async function POST(request: Request) {
  if (!authRequired()) return jsonOk({ skipped: true });
  const parsed = await readJson<{ password?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const password = String(parsed.body.password || "");
  if (!passwordMatches(password)) return jsonError("Wrong password", 401);
  const response = NextResponse.json({ ok: true });
  return applySessionCookie(response);
}

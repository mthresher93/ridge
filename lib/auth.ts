import { NextResponse } from "next/server";

const COOKIE = "lumen_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 14;
const enc = new TextEncoder();

function secret() {
  return process.env.SESSION_SECRET || process.env.APP_PASSWORD || "";
}

export function authRequired() {
  return Boolean(process.env.APP_PASSWORD);
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacHex(key: string, payload: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
  return Array.from(new Uint8Array(buf), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signSession(expiresAt: number) {
  const payload = String(expiresAt);
  const sig = await hmacHex(secret(), payload);
  return `${payload}.${sig}`;
}

export async function validSession(token: string | undefined) {
  if (!authRequired()) return true;
  if (!token || !secret()) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await hmacHex(secret(), payload);
  return safeEqual(sig, expected);
}

export function passwordMatches(password: string) {
  const expected = process.env.APP_PASSWORD || "";
  if (!expected) return true;
  return safeEqual(password, expected);
}

export async function sessionCookieValue() {
  return signSession(Date.now() + MAX_AGE_SEC * 1000);
}

export async function applySessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE, await sessionCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

export function captureTokenMatches(request: Request) {
  const expected = process.env.CAPTURE_TOKEN || "";
  if (!expected) return false;
  const header = request.headers.get("x-capture-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return header.length === expected.length && safeEqual(header, expected);
}

export function captureAllowed(request: Request, sessionOk: boolean) {
  const expected = process.env.CAPTURE_TOKEN || "";
  if (expected) return captureTokenMatches(request) || sessionOk;
  return sessionOk;
}

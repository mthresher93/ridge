"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/mark";

function nextPath(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) return "/";
  return raw;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Wrong password.");
        return;
      }
      window.location.assign(nextPath(searchParams.get("next")));
    } catch {
      setError("Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="az-brand">
          <BrandMark />
          <div>
            <div className="az-brand-name">Lumen</div>
            <div className="az-brand-sub">Freight OS</div>
          </div>
        </div>
        <h1>Sign in</h1>
        <p>This workspace is password-protected.</p>
        <label className="rec-field">
          Password
          <input className="az-input" type="password" value={password} autoFocus onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="rec-warn">{error}</p> : null}
        <button className="az-btn pri" type="submit" disabled={busy || !password}>
          {busy ? "Signing in…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-screen">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}

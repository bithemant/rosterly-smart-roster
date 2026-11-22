"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import Workspace from "@/components/workspace";

type User = {
  id: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "OPERATIONS_MANAGER" | "POD_LEAD" | "EMPLOYEE";
  employeeId: string | null;
  managedPodId: string | null;
};

type AuthStatus = {
  configured: boolean;
  connected: boolean;
  hasUsers: boolean;
  user: User | null;
  aiReady?: boolean;
};

function BrandLockup() {
  return (
    <div className="brand-lockup" aria-label="Rosterly">
      <span className="brand-mark" aria-hidden="true" />
      <span className="brand-name">rosterly<span>.</span></span>
    </div>
  );
}

function AuthFrame({ children, mode }: { children: React.ReactNode; mode: "login" | "setup" }) {
  return (
    <main className="login-shell">
      <div className="login-layout">
        <section className="login-story">
          <BrandLockup />
          <div>
            <h1>Clear coverage starts with a better plan.</h1>
            <p>Build monthly rosters around real operating rules, resource eligibility, and people’s availability.</p>
          </div>
          <div className="login-proof">Workforce planning · Coverage review · Manager control</div>
        </section>
        <section className="login-form-wrap">
          {mode === "login" ? (
            <>
              <div className="assistant-badge"><LockKeyhole size={12} /> SECURE WORKSPACE</div>
              <h2 style={{ marginTop: 14 }}>Welcome back</h2>
              <p>Sign in to see the roster information available to your role.</p>
            </>
          ) : (
            <>
              <div className="assistant-badge"><ShieldCheck size={12} /> ONE-TIME ADMIN SETUP</div>
              <h2 style={{ marginTop: 14 }}>Create the first admin</h2>
              <p>This setup closes automatically after the first administrator account is created.</p>
            </>
          )}
          {children}
        </section>
      </div>
    </main>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Sign in failed.");
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="form-field">
        <label htmlFor="login-email">Email address</label>
        <input id="login-email" className="form-input large" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="login-password">Password</label>
        <input id="login-password" className="form-input large" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? <LoaderCircle size={15} className="spin" /> : null} Sign in <ArrowRight size={14} />
      </button>
      <div className="setup-help">Role access is checked by the server for every roster and management request.</div>
    </form>
  );
}

function SetupForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ setupToken: "", displayName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Admin setup failed.");
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Admin setup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="form-field">
        <label htmlFor="setup-token">One-time setup token</label>
        <input id="setup-token" className="form-input large" type="password" autoComplete="off" required minLength={24} value={form.setupToken} onChange={(event) => update("setupToken", event.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="setup-name">Your name</label>
        <input id="setup-name" className="form-input large" autoComplete="name" required minLength={2} value={form.displayName} onChange={(event) => update("displayName", event.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="setup-email">Admin email</label>
        <input id="setup-email" className="form-input large" type="email" autoComplete="email" required value={form.email} onChange={(event) => update("email", event.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="setup-password">Password</label>
        <input id="setup-password" className="form-input large" type="password" autoComplete="new-password" required minLength={12} value={form.password} onChange={(event) => update("password", event.target.value)} />
        <small>Use at least 12 characters. This password is stored as a salted hash.</small>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? <LoaderCircle size={15} className="spin" /> : null} Create administrator <ArrowRight size={14} />
      </button>
      <div className="setup-help">Keep the setup token private. It is not saved to the account and will stop working after this first setup.</div>
    </form>
  );
}

export default function AppEntry() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [statusError, setStatusError] = useState("");

  const refreshStatus = useCallback(async () => {
    setStatusError("");
    try {
      const response = await fetch("/api/auth/status", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not check workspace status.");
      setStatus(await response.json() as AuthStatus);
    } catch {
      setStatusError("The workspace could not reach its application server. Refresh in a moment.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshStatus]);

  if (!status) {
    return <main className="loading-screen"><span>Loading Rosterly workspace…</span></main>;
  }

  if (!status.connected) {
    return (
      <main className="login-shell">
        <section className="panel" style={{ width: "min(560px, 100%)", padding: 28 }}>
          <BrandLockup />
          <div className="empty-icon" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}><AlertTriangle /></div>
          <h1 style={{ fontSize: 21, margin: "0 0 8px" }}>PostgreSQL is not reachable</h1>
          <p className="muted" style={{ lineHeight: 1.7, fontSize: 12 }}>Start Docker Desktop, then run the PostgreSQL service with <code>docker compose up -d</code>. No roster data has been loaded yet.</p>
          {statusError && <div className="form-error" role="alert">{statusError}</div>}
          <button className="button button-primary" style={{ marginTop: 14 }} onClick={() => void refreshStatus()}>Retry connection</button>
        </section>
      </main>
    );
  }

  if (status.user) return <Workspace user={status.user} aiReady={Boolean(status.aiReady)} onSignOut={() => void refreshStatus()} />;
  if (!status.hasUsers) return <AuthFrame mode="setup"><SetupForm onDone={() => void refreshStatus()} /></AuthFrame>;

  return (
    <AuthFrame mode="login">
      <LoginForm onDone={() => void refreshStatus()} />
      {statusError && <div className="form-error" role="alert">{statusError}</div>}
    </AuthFrame>
  );
}

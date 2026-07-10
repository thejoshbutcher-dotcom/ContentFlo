"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { MailCheck, PartyPopper, Send, Zap } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type Status = "idle" | "checking" | "sending" | "sent" | "denied";

// Inlined at build time; the block below is stripped from production bundles.
const DEV = process.env.NODE_ENV === "development";
const DEV_EMAIL = process.env.NEXT_PUBLIC_DEV_LOGIN_EMAIL ?? "";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const justPurchased = params.get("purchased") === "1";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState(params.get("error") ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Sign-in isn't configured yet.");
      return;
    }
    setError("");
    setStatus("checking");

    // Don't email a sign-in link to someone who can't get in anyway.
    // This is UX only — the real gate runs server-side on the app route.
    try {
      const res = await fetch("/api/auth/check-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not verify your access.");
      if (!data.hasAccess) {
        setStatus("denied");
        return;
      }
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    setStatus("sending");
    const redirect = new URL("/auth/confirm", window.location.origin);
    redirect.searchParams.set("next", next);

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect.toString() },
    });

    if (err) {
      setStatus("idle");
      setError(err.message);
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <div className="auth-card">
        <MailCheck size={30} className="auth-icon" />
        <h1 className="auth-title">Check your email</h1>
        <p className="auth-sub">
          We sent a sign-in link to <strong>{email}</strong>. Open it{" "}
          <strong>in this browser</strong> and you&apos;ll land straight in your
          workspace — and stay signed in on this device.
        </p>
        <button className="btn btn-ghost" onClick={() => setStatus("idle")}>
          Use a different email
        </button>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="auth-card">
        <h1 className="auth-title">No purchase found</h1>
        <p className="auth-sub">
          We couldn&apos;t find a CreatorFlo purchase for{" "}
          <strong>{email}</strong>. If you bought with a different email, try
          that one. Otherwise, grab your copy below.
        </p>
        <a className="btn btn-amber auth-cta" href="/purchase">
          Get CreatorFlo
        </a>
        <button
          className="btn btn-ghost"
          style={{ marginTop: 10 }}
          onClick={() => setStatus("idle")}
        >
          Try another email
        </button>
      </div>
    );
  }

  const busy = status === "checking" || status === "sending";

  return (
    <div className="auth-card">
      <Image
        src="/brand/logo-white.png"
        alt="CreatorFlo"
        width={168}
        height={38}
        priority
        className="auth-logo"
      />

      {justPurchased ? (
        <>
          <PartyPopper size={28} className="auth-icon" />
          <h1 className="auth-title">You&apos;re in</h1>
          <p className="auth-sub">
            Thanks for buying CreatorFlo. Enter the email you paid with to create
            your account and unlock your workspace.
          </p>
        </>
      ) : (
        <>
          <h1 className="auth-title">Sign in</h1>
          <p className="auth-sub">
            Enter the email you bought with and we&apos;ll send you a link. No
            password to remember.
          </p>
        </>
      )}

      <form onSubmit={submit} className="auth-form">
        <input
          className="prop-input setup-input"
          type="email"
          required
          autoFocus
          value={email}
          placeholder="you@example.com"
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn btn-amber" type="submit" disabled={busy}>
          <Send size={15} />
          {status === "checking"
            ? "Checking…"
            : status === "sending"
            ? "Sending…"
            : justPurchased
            ? "Create my account"
            : "Send sign-in link"}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {DEV && DEV_EMAIL && (
        <button
          className="dev-login-btn"
          disabled={busy}
          onClick={async () => {
            setStatus("checking");
            setError("");
            const res = await fetch("/api/dev-login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: DEV_EMAIL }),
            });
            if (res.ok) {
              window.location.href = next;
            } else {
              const d = await res.json().catch(() => ({}));
              setStatus("idle");
              setError(d.error ?? "Dev login failed.");
            }
          }}
        >
          <Zap size={13} /> Dev sign-in as {DEV_EMAIL}
        </button>
      )}

      {!justPurchased && (
        <p className="auth-foot">
          Don&apos;t have CreatorFlo yet? <a href="/purchase">Get it here.</a>
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="auth-screen">
      <Suspense fallback={<div className="auth-card" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

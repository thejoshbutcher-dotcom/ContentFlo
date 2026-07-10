"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { MailCheck, Send } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setStatus("error");
      setError("Sign-in isn't configured yet.");
      return;
    }
    setStatus("sending");
    setError("");

    const redirect = new URL("/auth/confirm", window.location.origin);
    redirect.searchParams.set("next", next);

    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirect.toString() },
    });

    if (err) {
      setStatus("error");
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
          We sent a sign-in link to <strong>{email}</strong>. Open it on any
          device and you&apos;ll land right in your workspace.
        </p>
        <button className="btn btn-ghost" onClick={() => setStatus("idle")}>
          Use a different email
        </button>
      </div>
    );
  }

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
      <h1 className="auth-title">Sign in</h1>
      <p className="auth-sub">
        Enter your email and we&apos;ll send you a link. No password to remember.
      </p>

      <form onSubmit={sendLink} className="auth-form">
        <input
          className="prop-input setup-input"
          type="email"
          required
          autoFocus
          value={email}
          placeholder="you@example.com"
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          className="btn btn-amber"
          type="submit"
          disabled={status === "sending"}
        >
          <Send size={15} />
          {status === "sending" ? "Sending…" : "Send sign-in link"}
        </button>
      </form>

      {status === "error" && <p className="auth-error">{error}</p>}
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

"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

export default function BuyButton({ email }: { email?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function buy() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn btn-amber auth-cta" onClick={buy} disabled={busy}>
        {busy ? (
          <>
            <Loader2 size={15} className="spin" /> Redirecting…
          </>
        ) : (
          <>
            <CreditCard size={15} /> Buy CreatorFlo
          </>
        )}
      </button>
      {error && <p className="auth-error">{error}</p>}
    </>
  );
}

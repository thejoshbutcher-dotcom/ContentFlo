"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/** The commit this bundle was built from (inlined by next.config.ts). */
const RUNNING = process.env.BUILD_COMMIT ?? "";
const CHECK_EVERY_MS = 5 * 60_000;

/**
 * An installed app window can stay open for days, quietly running whatever
 * build it loaded — so fixes "don't work" until someone thinks to reload.
 * This asks the server which commit is live (on focus, and every few minutes)
 * and offers a reload when it isn't the one we're running.
 *
 * It never reloads by itself: there may be a half-written script on screen.
 */
export default function UpdatePrompt() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!RUNNING) return; // dev, or a build without git — nothing to compare

    let stopped = false;
    let last = 0;

    async function check() {
      if (stopped || Date.now() - last < 60_000) return;
      last = Date.now();
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { commit } = (await res.json()) as { commit: string | null };
        if (!stopped && commit && commit !== RUNNING) setStale(true);
      } catch {
        /* offline — try again later */
      }
    }

    void check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="update-prompt" role="status">
      <RefreshCw size={14} />
      <span>A newer version of CreatorFlo is ready.</span>
      <button className="btn btn-amber" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

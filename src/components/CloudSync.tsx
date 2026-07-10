"use client";

import { useEffect, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { useAccounts } from "@/lib/accounts";
import type { ProfileRow } from "@/lib/mapping";
import {
  hasCloudData,
  hasLocalData,
  importLocalData,
} from "@/lib/migrate-local";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { setCloudUser, startSync } from "@/lib/sync";
import { readActiveProfileId } from "@/lib/workspace";

type Phase = "idle" | "checking" | "prompt" | "importing" | "loading" | "ready";

/**
 * Headless bootstrap. Runs only when a Supabase session exists — signed-out
 * users keep the original localStorage-only behaviour untouched.
 */
export default function CloudSync({ onReady }: { onReady?: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      setCloudUser(user.id);
      setPhase("checking");

      try {
        const cloudHasData = await hasCloudData(supabase);
        if (cancelled) return;

        if (!cloudHasData && hasLocalData()) {
          // Never migrate silently.
          setPhase("prompt");
          return;
        }
        await activate(supabase);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase("idle");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function activate(supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>) {
    setPhase("loading");

    const { data, error: err } = await supabase
      .from("profiles")
      .select("*")
      .order("sort", { ascending: true });
    if (err) throw err;

    const rows = (data ?? []) as ProfileRow[];
    if (rows.length) {
      useAccounts.setState({
        accounts: rows.map((r) => ({ id: r.id, name: r.name })),
      });
    }

    const saved = readActiveProfileId();
    const activeId =
      rows.find((r) => r.id === saved)?.id ?? rows[0]?.id ?? useAccounts.getState().activeId;

    useAccounts.getState().setActive(activeId);

    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (userId) await startSync(userId, activeId);

    setPhase("ready");
    onReady?.();
  }

  async function runImport() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setPhase("importing");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await importLocalData(supabase, user.id);
      await activate(supabase);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("prompt");
    }
  }

  async function skipImport() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    try {
      await activate(supabase);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (phase === "prompt" || phase === "importing") {
    return (
      <div className="modal-overlay">
        <div className="modal setup-modal import-modal">
          <div className="setup-body">
            <div className="setup-panel" style={{ textAlign: "center" }}>
              <CloudUpload size={30} className="auth-icon" />
              <h3 className="setup-title">Import your local data?</h3>
              <p className="setup-sub">
                We found content saved in this browser. Copy it into your account
                so it&apos;s available on every device. Your local copy is kept as
                a backup either way.
              </p>
              {error && <p className="auth-error">{error}</p>}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "center",
                  marginTop: 8,
                }}
              >
                <button
                  className="btn btn-ghost"
                  onClick={skipImport}
                  disabled={phase === "importing"}
                >
                  Start empty
                </button>
                <button
                  className="btn btn-amber"
                  onClick={runImport}
                  disabled={phase === "importing"}
                >
                  {phase === "importing" ? (
                    <>
                      <Loader2 size={15} className="spin" /> Importing…
                    </>
                  ) : (
                    <>
                      <CloudUpload size={15} /> Import my data
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

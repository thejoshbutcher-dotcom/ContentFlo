"use client";

import { useEffect, useState } from "react";
import { CloudUpload, Loader2, TriangleAlert, X } from "lucide-react";
import { useAccounts } from "@/lib/accounts";
import {
  hasCloudData,
  hasLocalData,
  importLocalData,
} from "@/lib/migrate-local";
import { defaultProfileData } from "@/lib/profile";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { setCloudUser } from "@/lib/sync";
import { loadIncomingInvites } from "@/lib/team";
import { newId } from "@/lib/templates";
import {
  loadAccounts,
  openInitialAccount,
  readActiveProfileId,
  refreshAccounts,
} from "@/lib/workspace";

type Phase =
  | "idle"
  | "checking"
  | "prompt"
  | "importing"
  | "loading"
  | "ready"
  | "error";

/**
 * Identity for a brand-new user's first cloud profile. Profile ids are
 * GLOBAL primary keys, so the local-only placeholder id "default" must never
 * be sent up: the first customer to do so owns it, and everyone after them
 * would fail to create theirs.
 */
function seedProfileIdentity(): { id: string; name: string } {
  const { accounts, activeId } = useAccounts.getState();
  const active = accounts.find((a) => a.id === activeId);
  const id = active && active.id !== "default" ? active.id : newId("acct");
  return { id, name: active?.name ?? "My Brand" };
}

/**
 * Headless bootstrap. Runs only when a Supabase session exists — signed-out
 * users keep the original localStorage-only behaviour untouched.
 */
export default function CloudSync({
  onReady,
  onFirstRun,
}: {
  onReady?: () => void;
  /** Fired once, the first time an account ever signs in (its first profile
   *  was just created) — the moment to show someone around. */
  onFirstRun?: () => void;
}) {
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

      setCloudUser(user.id, user.email ?? null);
      setPhase("checking");

      try {
        const cloudHasData = await hasCloudData(supabase, user.id);
        if (cancelled) return;

        if (!cloudHasData && hasLocalData()) {
          // Never migrate silently.
          setPhase("prompt");
          return;
        }
        await activate(supabase);
      } catch (err) {
        if (!cancelled) {
          // Never fail silently — this used to render nothing at all.
          console.error("[cloud-sync] bootstrap failed", err);
          setError(err instanceof Error ? err.message : String(err));
          setPhase("error");
        }
      }
    })();

    // Coming back to the tab: an invite may have arrived, or access changed.
    let last = 0;
    const onFocus = () => {
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      void refreshAccounts();
      void supabase.auth
        .getUser()
        .then(({ data }) => loadIncomingInvites(data.user?.email ?? null));
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function activate(supabase: NonNullable<ReturnType<typeof getSupabaseBrowser>>) {
    setPhase("loading");

    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error("No session");

    let { owned, all } = await loadAccounts(supabase, userId);

    // A signed-in user with no profile OF THEIR OWN (fresh account, "Start
    // empty", or someone who so far only has profiles shared with them) still
    // gets one: it's their private space, and cards.profile_id references it.
    const firstRun = !owned.length;
    if (firstRun) {
      const { id, name } = seedProfileIdentity();
      const { error: insErr } = await supabase.from("profiles").insert({
        id,
        user_id: userId,
        name,
        sort: 0,
        data: defaultProfileData(),
      });
      if (insErr) throw insErr;
      ({ owned, all } = await loadAccounts(supabase, userId));
    }

    const saved = readActiveProfileId();
    const activeId = all.find((a) => a.id === saved)?.id ?? owned[0].id;
    await openInitialAccount(userId, activeId);

    void loadIncomingInvites((await supabase.auth.getUser()).data.user?.email ?? null);

    setPhase("ready");
    onReady?.();
    if (firstRun) onFirstRun?.();
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
      console.error("[cloud-sync] activate failed", err);
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  if (phase === "error") {
    return (
      <div className="sync-error">
        <TriangleAlert size={15} />
        <span>
          Cloud sync couldn&apos;t start: {error}. Your work is still saved in
          this browser.
        </span>
        <button onClick={() => setPhase("idle")} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    );
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

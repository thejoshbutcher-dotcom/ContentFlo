"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { setReadOnly } from "./access";
import { Account, plannerKey, profileKey, useAccounts } from "./accounts";
import type { ProfileRow } from "./mapping";
import { defaultProfileData, useProfile } from "./profile";
import { usePlanner } from "./store";
import { getSupabaseBrowser } from "./supabase/client";
import { getCloudUser, startSync, stopSync } from "./sync";
import { loadRoster, Role, useTeam } from "./team";

const ACTIVE_KEY = "cf-active-profile";

export function roleOf(id: string): Role {
  return useAccounts.getState().accounts.find((a) => a.id === id)?.role ?? "owner";
}

/** Make the stores and the UI agree on what this user may do here. */
function applyRole(id: string) {
  const role = roleOf(id);
  setReadOnly(role === "viewer");
  useTeam.setState({ role, peers: [], roster: [] });
  void loadRoster(id);
}

/** Aim both persisted stores at a profile's local cache keys. */
function pointStoresAt(id: string) {
  usePlanner.persist.setOptions({ name: plannerKey(id) });
  useProfile.persist.setOptions({ name: profileKey(id) });
}

/**
 * Every profile this user can open — their own first, then ones shared with
 * them — written into the accounts store with a role on each.
 *
 * The membership query is allowed to fail: before the teams migration runs,
 * `profile_members` doesn't exist, and everything readable is simply owned.
 */
export async function loadAccounts(
  supabase: SupabaseClient,
  userId: string
): Promise<{ owned: ProfileRow[]; all: Account[] }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,user_id,name,sort")
    .order("sort", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as ProfileRow[];

  const { data: mine } = await supabase
    .from("profile_members")
    .select("profile_id,role,inviter_email")
    .eq("user_id", userId);
  const memberships = new Map(
    ((mine ?? []) as { profile_id: string; role: "editor" | "viewer"; inviter_email: string | null }[]).map(
      (m) => [m.profile_id, m]
    )
  );

  const owned = rows.filter((r) => r.user_id === userId);
  const shared = rows
    .filter((r) => r.user_id !== userId && memberships.has(r.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const all: Account[] = [
    ...owned.map((r) => ({ id: r.id, name: r.name, role: "owner" as const })),
    ...shared.map((r) => ({
      id: r.id,
      name: r.name,
      role: memberships.get(r.id)!.role,
      sharedBy: memberships.get(r.id)!.inviter_email ?? undefined,
    })),
  ];
  if (all.length) useAccounts.setState({ accounts: all });
  return { owned, all };
}

/**
 * Re-read the profile list — after accepting an invite, leaving, or coming
 * back to the tab. If the open profile is gone (deleted, or access removed),
 * fall back to one of the user's own.
 */
export async function refreshAccounts(): Promise<void> {
  const userId = getCloudUser();
  const supabase = getSupabaseBrowser();
  if (!userId || !supabase) return;

  const before = roleOf(useAccounts.getState().activeId);
  let all: Account[];
  try {
    ({ all } = await loadAccounts(supabase, userId));
  } catch {
    return; // offline — keep what we have
  }
  if (!all.length) return;

  const activeId = useAccounts.getState().activeId;
  if (!all.some((a) => a.id === activeId)) {
    await switchAccount(all[0].id, { discardPending: true });
  } else if (roleOf(activeId) !== before) {
    // Promoted or demoted while here.
    applyRole(activeId);
  }
}

/**
 * Point both persisted stores at the target profile's local keys, then either
 * load its saved data or start it fresh. Never write before rehydrating —
 * that would clobber the target profile's saved data.
 *
 * When signed in, the cloud is the source of truth: local rehydrate paints
 * instantly, then `startSync` pulls the authoritative rows over the top.
 */
export async function switchAccount(
  id: string,
  opts: { discardPending?: boolean } = {}
): Promise<void> {
  const { accounts, setActive } = useAccounts.getState();
  if (!accounts.some((a) => a.id === id)) return;

  // Drain any pending writes for the profile we're leaving — unless we've
  // lost access to it, in which case they can never land.
  if (opts.discardPending) {
    try {
      localStorage.removeItem(`cf-outbox:${useAccounts.getState().activeId}`);
    } catch {
      /* ignore */
    }
  }
  await stopSync();

  setActive(id);
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }

  // Lift the viewer lock while swapping data in; re-applied just below.
  setReadOnly(false);

  usePlanner.persist.setOptions({ name: plannerKey(id) });
  if (localStorage.getItem(plannerKey(id))) {
    await usePlanner.persist.rehydrate();
  } else {
    usePlanner.setState({ cards: [] });
  }

  useProfile.persist.setOptions({ name: profileKey(id) });
  if (localStorage.getItem(profileKey(id))) {
    await useProfile.persist.rehydrate();
  } else {
    useProfile.setState(defaultProfileData());
  }

  applyRole(id);

  const userId = getCloudUser();
  if (userId) await startSync(userId, id);
}

/** First activation after sign-in: no profile to leave, just open one. */
export async function openInitialAccount(userId: string, id: string) {
  useAccounts.getState().setActive(id);
  pointStoresAt(id);
  applyRole(id);
  await startSync(userId, id);
}

export async function createAccount(name: string): Promise<string> {
  const acc = useAccounts.getState().add(name);

  const userId = getCloudUser();
  const supabase = getSupabaseBrowser();
  if (userId && supabase) {
    const { error } = await supabase.from("profiles").insert({
      id: acc.id,
      user_id: userId,
      name: acc.name,
      sort: useAccounts.getState().accounts.length,
      data: defaultProfileData(),
    });
    if (error) console.error("[workspace] failed to create cloud profile", error);
  }

  await switchAccount(acc.id);
  return acc.id;
}

/**
 * Delete a profile you own — or, for one shared with you, leave it. Leaving
 * only removes your membership; the owner's content is untouched.
 */
export async function deleteAccount(id: string): Promise<void> {
  const st = useAccounts.getState();
  if (st.accounts.length <= 1) return;
  const wasActive = st.activeId === id;
  const isOwner = roleOf(id) === "owner";
  // Never leave yourself with no profile of your own to fall back to.
  if (isOwner && st.accounts.filter((a) => (a.role ?? "owner") === "owner").length <= 1) return;

  if (wasActive) await stopSync();

  const userId = getCloudUser();
  const supabase = getSupabaseBrowser();
  if (userId && supabase) {
    const { error } = isOwner
      ? // Cards and memberships cascade via the profile_id foreign key.
        await supabase.from("profiles").delete().eq("id", id)
      : await supabase
          .from("profile_members")
          .delete()
          .eq("profile_id", id)
          .eq("user_id", userId);
    if (error) console.error("[workspace] failed to remove cloud profile", error);
  }

  st.remove(id);
  localStorage.removeItem(plannerKey(id));
  localStorage.removeItem(profileKey(id));
  localStorage.removeItem(`cf-outbox:${id}`);

  if (wasActive) {
    await switchAccount(useAccounts.getState().activeId);
  }
}

/** Rename locally and in the cloud. Owners only (the database agrees). */
export async function renameAccount(id: string, name: string): Promise<void> {
  if (roleOf(id) !== "owner") return;
  useAccounts.getState().rename(id, name);
  const userId = getCloudUser();
  const supabase = getSupabaseBrowser();
  if (userId && supabase) {
    const final = useAccounts.getState().accounts.find((a) => a.id === id)?.name;
    if (final) await supabase.from("profiles").update({ name: final }).eq("id", id);
  }
}

export function readActiveProfileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

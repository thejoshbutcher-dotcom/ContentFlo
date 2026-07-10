"use client";

import { plannerKey, profileKey, useAccounts } from "./accounts";
import { defaultProfileData, useProfile } from "./profile";
import { usePlanner } from "./store";
import { getSupabaseBrowser } from "./supabase/client";
import { getCloudUser, startSync, stopSync } from "./sync";

const ACTIVE_KEY = "cf-active-profile";

/**
 * Point both persisted stores at the target profile's local keys, then either
 * load its saved data or start it fresh. Never write before rehydrating —
 * that would clobber the target profile's saved data.
 *
 * When signed in, the cloud is the source of truth: local rehydrate paints
 * instantly, then `startSync` pulls the authoritative rows over the top.
 */
export async function switchAccount(id: string): Promise<void> {
  const { accounts, setActive } = useAccounts.getState();
  if (!accounts.some((a) => a.id === id)) return;

  // Drain any pending writes for the profile we're leaving.
  await stopSync();

  setActive(id);
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }

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

  const userId = getCloudUser();
  if (userId) await startSync(userId, id);
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

export async function deleteAccount(id: string): Promise<void> {
  const st = useAccounts.getState();
  if (st.accounts.length <= 1) return;
  const wasActive = st.activeId === id;

  if (wasActive) await stopSync();

  const userId = getCloudUser();
  const supabase = getSupabaseBrowser();
  if (userId && supabase) {
    // Cards cascade via the profile_id foreign key.
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) console.error("[workspace] failed to delete cloud profile", error);
  }

  st.remove(id);
  localStorage.removeItem(plannerKey(id));
  localStorage.removeItem(profileKey(id));
  localStorage.removeItem(`cf-outbox:${id}`);

  if (wasActive) {
    await switchAccount(useAccounts.getState().activeId);
  }
}

/** Rename locally and in the cloud. */
export async function renameAccount(id: string, name: string): Promise<void> {
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

"use client";

import { plannerKey, profileKey, useAccounts } from "./accounts";
import { EMPTY_PROFILE, useProfile } from "./profile";
import { usePlanner } from "./store";

// Point both persisted stores at the target account's keys, then either
// load its saved data or start it fresh. Never write before rehydrating —
// that would clobber the target account's saved data.
export async function switchAccount(id: string): Promise<void> {
  const { accounts, setActive } = useAccounts.getState();
  if (!accounts.some((a) => a.id === id)) return;
  setActive(id);

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
    useProfile.setState({ ...EMPTY_PROFILE, topics: [...EMPTY_PROFILE.topics] });
  }
}

export async function createAccount(name: string): Promise<string> {
  const acc = useAccounts.getState().add(name);
  await switchAccount(acc.id);
  return acc.id;
}

export async function deleteAccount(id: string): Promise<void> {
  const st = useAccounts.getState();
  if (st.accounts.length <= 1) return;
  const wasActive = st.activeId === id;
  st.remove(id);
  localStorage.removeItem(plannerKey(id));
  localStorage.removeItem(profileKey(id));
  if (wasActive) {
    await switchAccount(useAccounts.getState().activeId);
  }
}

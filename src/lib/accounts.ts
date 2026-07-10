"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newId } from "./templates";

export interface Account {
  id: string;
  name: string;
}

interface AccountsState {
  accounts: Account[];
  activeId: string;
  setActive: (id: string) => void;
  add: (name: string) => Account;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

export const useAccounts = create<AccountsState>()(
  persist(
    (set, get) => ({
      accounts: [{ id: "default", name: "My Brand" }],
      activeId: "default",
      setActive: (id) => set({ activeId: id }),
      add: (name) => {
        const acc: Account = {
          id: newId("acct"),
          name: name.trim() || "New profile",
        };
        set({ accounts: [...get().accounts, acc] });
        return acc;
      },
      rename: (id, name) =>
        set({
          accounts: get().accounts.map((a) =>
            a.id === id ? { ...a, name: name.trim() || a.name } : a
          ),
        }),
      remove: (id) => {
        const left = get().accounts.filter((a) => a.id !== id);
        if (left.length === 0) return;
        set({
          accounts: left,
          activeId: get().activeId === id ? left[0].id : get().activeId,
        });
      },
    }),
    { name: "jbo-planner-accounts" }
  )
);

// The original single-profile install used unsuffixed keys, so the
// "default" account keeps pointing at them and old data survives.
export function plannerKey(id: string): string {
  return id === "default" ? "jbo-content-planner" : `jbo-content-planner:${id}`;
}

export function profileKey(id: string): string {
  return id === "default" ? "jbo-planner-profile" : `jbo-planner-profile:${id}`;
}

export function activeAccountId(): string {
  return useAccounts.getState().activeId;
}

"use client";

import { initLocalCache } from "./localCache";
import { useProfile } from "./profile";
import { usePlanner } from "./store";

let booted: Promise<void> | null = null;

/**
 * Load the local copies (IndexedDB) and hydrate both stores from them —
 * BEFORE anything renders or cloud sync starts, so a slow local read can never
 * land on top of fresher cloud data. Runs once.
 */
export function bootLocalState(): Promise<void> {
  booted ??= initLocalCache().then(async () => {
    await usePlanner.persist.rehydrate();
    await useProfile.persist.rehydrate();
  });
  return booted;
}

"use client";

import { createJSONStorage } from "zustand/middleware";

/**
 * localStorage for the planner/profile stores, made unable to break anything.
 *
 * Browsers give a site roughly 5 MB of localStorage, shared by every key. Each
 * profile keeps a copy of its cards here (pasted images included), so someone
 * who opens a few image-heavy boards fills it up. The write then THROWS — and
 * that exception used to abort cloud sync on start-up ("Cloud sync couldn't
 * start: … exceeded the quota"), after which nothing anyone typed was saved
 * anywhere.
 *
 * When signed in, these copies are only a cache — the cloud is the source of
 * truth — so on a full store we make room and degrade instead of failing:
 *   1. drop other profiles' copies and competitor caches (they re-download),
 *   2. write this copy without inline images (the cloud pull brings them back),
 *   3. failing that, drop this copy.
 * Signed out, local storage IS the only copy, so nothing is ever evicted or
 * slimmed: the previous save is kept and the failure is only reported.
 */

let cloudBacked = false;

/** Set from sync.ts when a cloud user signs in / out. */
export function setCacheIsCloudBacked(on: boolean) {
  cloudBacked = on;
}

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22)
  );
}

const CACHE_KEY = /^(jbo-content-planner|jbo-planner-profile)(?::(.+))?$/;

/** Remove disposable caches, keeping every key that belongs to `keep`'s profile. */
function evictOthers(keep: string): boolean {
  const own = CACHE_KEY.exec(keep)?.[2] ?? "default";
  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k === keep) continue;
    const m = CACHE_KEY.exec(k);
    if ((m && (m[2] ?? "default") !== own) || k.startsWith("cf-comp:")) doomed.push(k);
  }
  doomed.forEach((k) => localStorage.removeItem(k));
  return doomed.length > 0;
}

/** The same JSON with every inline image (data: URL) emptied. */
function withoutImages(value: string): string {
  return value.replace(/data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/g, "");
}

let warned = false;
function warnOnce(name: string, e: unknown) {
  if (warned) return;
  warned = true;
  console.warn(`[storage] couldn't save the local copy of ${name}`, e);
}

const safeLocalStorage = {
  getItem(name: string): string | null {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem(name: string, value: string): void {
    try {
      localStorage.setItem(name, value);
      return;
    } catch (e) {
      if (!isQuotaError(e) || !cloudBacked) {
        warnOnce(name, e);
        return;
      }
    }
    try {
      if (evictOthers(name)) {
        localStorage.setItem(name, value);
        return;
      }
    } catch {
      /* still full */
    }
    try {
      localStorage.setItem(name, withoutImages(value));
      return;
    } catch (e) {
      warnOnce(name, e);
    }
    try {
      localStorage.removeItem(name); // a stale copy is worse than none
    } catch {
      /* ignore */
    }
  },
  removeItem(name: string): void {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

/** Drop-in `storage` for zustand's persist middleware. */
export const safePersistStorage = () => createJSONStorage(() => safeLocalStorage);

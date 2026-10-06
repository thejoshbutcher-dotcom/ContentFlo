"use client";

import { createJSONStorage } from "zustand/middleware";

/**
 * Where each profile's local copy of its cards and settings lives: IndexedDB.
 *
 * It used to be localStorage, which browsers cap at roughly 5 MB per site,
 * shared by every key. Cards carry their pasted images inline, so a couple of
 * image-heavy boards filled it — and a failed write once aborted cloud sync
 * (2026-10-06). IndexedDB is allowed far more (typically hundreds of MB or
 * more), so every board caches with all its images.
 *
 * zustand's persist middleware wants a SYNCHRONOUS storage, and an async one
 * would let a stale local copy finish loading after the cloud data and
 * overwrite it. So the whole cache is read into memory once (`initLocalCache`,
 * awaited before the app renders — see boot.ts), reads come from that memory,
 * and writes land in memory at once and reach IndexedDB in the background
 * (latest value per key wins).
 *
 * Existing copies are moved over from localStorage on first run, which also
 * frees that space. If IndexedDB can't be opened (some locked-down browsers),
 * the copies stay in localStorage with the old safe behaviour: a full store is
 * trimmed when signed in, and never throws.
 */

const DB_NAME = "creatorflo-cache";
const STORE = "kv";

/** Keys this module owns: each profile's planner + profile copy. */
const CACHE_KEY = /^(jbo-content-planner|jbo-planner-profile)(?::(.+))?$/;

let mode: "idb" | "local" | null = null;
let db: IDBDatabase | null = null;
const mem = new Map<string, string>();
let initPromise: Promise<void> | null = null;

let cloudBacked = false;

/** Set from sync.ts when a cloud user signs in / out. Signed in, the local
 *  copies are only a cache and may be trimmed when storage is full. */
export function setCacheIsCloudBacked(on: boolean) {
  cloudBacked = on;
}

export function localCacheReady(): boolean {
  return mode !== null;
}

// ————— IndexedDB plumbing —————

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("IndexedDB blocked"));
  });
}

// Per-key write queue: only the newest value of a key is ever written next.
const pending = new Map<string, string | null>(); // null = delete
const inflight = new Set<string>();

function queueWrite(key: string, value: string | null) {
  pending.set(key, value);
  if (mode === "idb") void drain(key);
}

async function drain(key: string) {
  if (inflight.has(key) || !db) return;
  inflight.add(key);
  try {
    while (pending.has(key)) {
      const value = pending.get(key)!;
      pending.delete(key);
      try {
        await writeOne(key, value);
      } catch (e) {
        if (value !== null && isQuotaError(e) && cloudBacked) {
          await makeRoom(key);
          try {
            await writeOne(key, withoutImages(value));
          } catch (e2) {
            warnOnce(key, e2);
          }
        } else {
          warnOnce(key, e);
        }
      }
    }
  } finally {
    inflight.delete(key);
  }
}

function writeOne(key: string, value: string | null): Promise<void> {
  return new Promise((res, rej) => {
    const tx = db!.transaction(STORE, "readwrite");
    const st = tx.objectStore(STORE);
    if (value === null) st.delete(key);
    else st.put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

/** Drop other profiles' copies (they're in the cloud) to make room. */
async function makeRoom(keep: string) {
  const own = CACHE_KEY.exec(keep)?.[2] ?? "default";
  for (const k of [...mem.keys()]) {
    const m = CACHE_KEY.exec(k);
    if (m && (m[2] ?? "default") !== own) {
      mem.delete(k);
      try {
        await writeOne(k, null);
      } catch {
        /* ignore */
      }
    }
  }
}

// ————— start-up —————

/**
 * Load every cached copy into memory (moving any still in localStorage into
 * IndexedDB first). Resolves once; safe to call repeatedly.
 */
export function initLocalCache(): Promise<void> {
  initPromise ??= (async () => {
    try {
      if (typeof indexedDB === "undefined") throw new Error("no IndexedDB");
      db = await Promise.race([
        openDb(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("IndexedDB timeout")), 4000)),
      ]);
      const tx = db.transaction(STORE, "readonly");
      const st = tx.objectStore(STORE);
      const [keys, values] = await Promise.all([req(st.getAllKeys()), req(st.getAll())]);
      keys.forEach((k, i) => {
        // A write made before start-up finished is newer than what's stored.
        if (!pending.has(String(k))) mem.set(String(k), String(values[i]));
      });
      mode = "idb";

      // Move copies over from localStorage, then free that space.
      const legacy: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && CACHE_KEY.test(k)) legacy.push(k);
      }
      for (const k of legacy) {
        const v = localStorage.getItem(k);
        if (v !== null && !mem.has(k) && !pending.has(k)) {
          mem.set(k, v);
          try {
            await writeOne(k, v);
          } catch (e) {
            warnOnce(k, e);
            continue; // keep the localStorage copy if it couldn't be moved
          }
        }
        localStorage.removeItem(k);
      }
      [...pending.keys()].forEach((k) => void drain(k));
    } catch (e) {
      console.warn("[cache] IndexedDB unavailable; keeping copies in localStorage", e);
      db = null;
      mode = "local";
      pending.clear();
    }
  })();
  return initPromise;
}

// ————— reads / writes —————

export function cacheGet(key: string): string | null {
  if (mode === "idb" && CACHE_KEY.test(key)) return mem.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function cacheHas(key: string): boolean {
  return cacheGet(key) !== null;
}

export function cacheRemove(key: string) {
  mem.delete(key);
  if (mode !== "local") queueWrite(key, null);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function cacheSet(key: string, value: string) {
  if (mode === "local") {
    localSet(key, value);
    return;
  }
  // IndexedDB (or not started yet: held in memory and written once it opens).
  mem.set(key, value);
  queueWrite(key, value);
}

// ————— localStorage fallback (only when IndexedDB is unavailable) —————

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22)
  );
}

/** The same JSON with every inline image (data: URL) emptied. */
function withoutImages(value: string): string {
  return value.replace(/data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/g, "");
}

let warned = false;
function warnOnce(name: string, e: unknown) {
  if (warned) return;
  warned = true;
  console.warn(`[cache] couldn't save the local copy of ${name}`, e);
}

function localSet(name: string, value: string) {
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
    // Other profiles' copies and competitor caches re-download from the cloud.
    const own = CACHE_KEY.exec(name)?.[2] ?? "default";
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === name) continue;
      const m = CACHE_KEY.exec(k);
      if ((m && (m[2] ?? "default") !== own) || k.startsWith("cf-comp:")) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
    if (doomed.length) {
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
}

/** Drop-in `storage` for zustand's persist middleware. Never throws. */
export const safePersistStorage = () =>
  createJSONStorage(() => ({
    getItem: (name: string) => cacheGet(name),
    setItem: (name: string, value: string) => cacheSet(name, value),
    removeItem: (name: string) => cacheRemove(name),
  }));

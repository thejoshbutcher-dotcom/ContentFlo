"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CardRow, ProfileRow, cardToRow, rowToCard } from "./mapping";
import { defaultProfileData, useProfile } from "./profile";
import { getSupabaseBrowser } from "./supabase/client";
import { usePlanner } from "./store";
import { ContentCard } from "./types";

const FLUSH_IDLE_MS = 800; // quiet period after the last keystroke
const FLUSH_MAX_MS = 3000; // never wait longer than this while typing

interface Outbox {
  dirty: string[];
  deleted: string[];
  profileDirty: boolean;
}

interface SyncSession {
  userId: string;
  profileId: string;
  supabase: SupabaseClient;
  dirty: Set<string>;
  deleted: Set<string>;
  profileDirty: boolean;
  unsubscribes: (() => void)[];
  idleTimer: ReturnType<typeof setTimeout> | null;
  maxTimer: ReturnType<typeof setTimeout> | null;
  /** Suppresses change-tracking while we write cloud data into the stores. */
  hydrating: boolean;
}

let session: SyncSession | null = null;

/** Set once the user is signed in; null means local-only mode. */
let cloudUserId: string | null = null;

export function setCloudUser(id: string | null) {
  cloudUserId = id;
}

export function getCloudUser(): string | null {
  return cloudUserId;
}

export function isSyncing(): boolean {
  return session !== null;
}

// ————— Outbox: survives a reload so an unflushed delete isn't resurrected —————

function outboxKey(profileId: string) {
  return `cf-outbox:${profileId}`;
}

function saveOutbox(s: SyncSession) {
  const box: Outbox = {
    dirty: [...s.dirty],
    deleted: [...s.deleted],
    profileDirty: s.profileDirty,
  };
  try {
    if (!box.dirty.length && !box.deleted.length && !box.profileDirty) {
      localStorage.removeItem(outboxKey(s.profileId));
    } else {
      localStorage.setItem(outboxKey(s.profileId), JSON.stringify(box));
    }
  } catch {
    // Quota or private mode — the in-memory sets still drive this session.
  }
}

function loadOutbox(profileId: string): Outbox {
  try {
    const raw = localStorage.getItem(outboxKey(profileId));
    if (raw) return JSON.parse(raw) as Outbox;
  } catch {
    /* ignore */
  }
  return { dirty: [], deleted: [], profileDirty: false };
}

// ————— Flush —————

function scheduleFlush() {
  const s = session;
  if (!s) return;

  if (s.idleTimer) clearTimeout(s.idleTimer);
  s.idleTimer = setTimeout(() => void flush(), FLUSH_IDLE_MS);

  // Guarantee a write even while the user keeps typing.
  s.maxTimer ??= setTimeout(() => void flush(), FLUSH_MAX_MS);
}

function clearTimers(s: SyncSession) {
  if (s.idleTimer) clearTimeout(s.idleTimer);
  if (s.maxTimer) clearTimeout(s.maxTimer);
  s.idleTimer = null;
  s.maxTimer = null;
}

/** Push all pending changes. Safe to await before switching profiles. */
export async function flush(): Promise<void> {
  const s = session;
  if (!s) return;
  clearTimers(s);

  const dirtyIds = [...s.dirty];
  const deletedIds = [...s.deleted];
  const wantProfile = s.profileDirty;
  if (!dirtyIds.length && !deletedIds.length && !wantProfile) return;

  // Clear optimistically; re-add on failure so the outbox retries.
  s.dirty.clear();
  s.deleted.clear();
  s.profileDirty = false;

  const cards = usePlanner.getState().cards;
  const rows = dirtyIds
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is ContentCard => Boolean(c))
    .map((c) => cardToRow(c, s.userId, s.profileId));

  try {
    if (rows.length) {
      const { error } = await s.supabase.from("cards").upsert(rows);
      if (error) throw error;
    }

    if (deletedIds.length) {
      // Soft delete. A hard delete would let a stale device re-insert the row.
      const { error } = await s.supabase
        .from("cards")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", deletedIds);
      if (error) throw error;
    }

    if (wantProfile) {
      const p = useProfile.getState();
      const { error } = await s.supabase
        .from("profiles")
        .update({
          data: {
            brandName: p.brandName,
            niche: p.niche,
            audience: p.audience,
            offer: p.offer,
            socials: p.socials,
            buckets: p.buckets,
            topics: p.topics,
            formats: p.formats,
            feelings: p.feelings,
            actions: p.actions,
            setupComplete: p.setupComplete,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", s.profileId);
      if (error) throw error;
    }

    saveOutbox(s);
  } catch (err) {
    // Put everything back and try again on the next change or focus.
    dirtyIds.forEach((id) => s.dirty.add(id));
    deletedIds.forEach((id) => s.deleted.add(id));
    if (wantProfile) s.profileDirty = true;
    saveOutbox(s);
    console.error("[sync] flush failed, will retry", err);
  }
}

// ————— Pull —————

/** Replace local state with the cloud's copy of this profile. */
export async function pull(supabase: SupabaseClient, profileId: string) {
  const { data: cardRows, error: cardErr } = await supabase
    .from("cards")
    .select("*")
    .eq("profile_id", profileId)
    .is("deleted_at", null);
  if (cardErr) throw cardErr;

  const { data: profileRow, error: profErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();
  if (profErr) throw profErr;

  const cards = (cardRows as CardRow[]).map(rowToCard);
  const data = (profileRow as ProfileRow | null)?.data;

  const wasHydrating = session?.hydrating;
  if (session) session.hydrating = true;

  usePlanner.setState({ cards });
  useProfile.setState({ ...defaultProfileData(), ...(data ?? {}) });

  if (session) session.hydrating = wasHydrating ?? false;
}

/**
 * Manual refresh: push anything pending, then pull the cloud's latest copy so
 * cards added or edited on another device/session show up here. No-op when
 * running local-only (signed out).
 */
export async function refreshFromCloud(): Promise<void> {
  const s = session;
  if (!s) return;
  await flush();
  await pull(s.supabase, s.profileId);
}

// ————— Change tracking —————

function attachSubscriptions(s: SyncSession) {
  let prevCards = usePlanner.getState().cards;

  const unsubCards = usePlanner.subscribe((state) => {
    const next = state.cards;
    if (s.hydrating) {
      prevCards = next;
      return;
    }
    if (next === prevCards) return;

    const prevById = new Map(prevCards.map((c) => [c.id, c]));
    const nextIds = new Set<string>();

    for (const card of next) {
      nextIds.add(card.id);
      // Reference equality: any store mutation produces a new object.
      if (prevById.get(card.id) !== card) {
        s.dirty.add(card.id);
        s.deleted.delete(card.id);
      }
    }
    for (const card of prevCards) {
      if (!nextIds.has(card.id)) {
        s.deleted.add(card.id);
        s.dirty.delete(card.id);
      }
    }

    prevCards = next;
    saveOutbox(s);
    scheduleFlush();
  });

  let prevProfile = useProfile.getState();
  const unsubProfile = useProfile.subscribe((state) => {
    if (s.hydrating) {
      prevProfile = state;
      return;
    }
    if (state === prevProfile) return;
    prevProfile = state;
    s.profileDirty = true;
    saveOutbox(s);
    scheduleFlush();
  });

  const onFocus = () => void flush();
  window.addEventListener("focus", onFocus);
  window.addEventListener("beforeunload", onFocus);

  s.unsubscribes.push(unsubCards, unsubProfile, () => {
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("beforeunload", onFocus);
  });
}

// ————— Lifecycle —————

/** Pull the profile from the cloud, then start pushing local changes to it. */
export async function startSync(userId: string, profileId: string) {
  await stopSync();

  const supabase = getSupabaseBrowser();
  if (!supabase) return;

  const s: SyncSession = {
    userId,
    profileId,
    supabase,
    dirty: new Set(),
    deleted: new Set(),
    profileDirty: false,
    unsubscribes: [],
    idleTimer: null,
    maxTimer: null,
    hydrating: true,
  };
  session = s;

  await pull(supabase, profileId);

  // Replay anything a previous session failed to write (e.g. offline delete).
  const box = loadOutbox(profileId);
  box.dirty.forEach((id) => s.dirty.add(id));
  box.deleted.forEach((id) => s.deleted.add(id));
  s.profileDirty = box.profileDirty;

  s.hydrating = false;
  attachSubscriptions(s);

  if (s.dirty.size || s.deleted.size || s.profileDirty) await flush();
}

/** Drain pending writes and detach. */
export async function stopSync() {
  const s = session;
  if (!s) return;
  await flush();
  clearTimers(s);
  s.unsubscribes.forEach((fn) => fn());
  session = null;
}

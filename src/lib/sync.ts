"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { isReadOnly } from "./access";
import { profileKey } from "./accounts";
import { CardRow, ProfileRow, cardToRow, rowToCard } from "./mapping";
import { deepEqual, mergeCard, mergeProfileData } from "./merge";
import { defaultProfileData, useProfile } from "./profile";
import { getSupabaseBrowser } from "./supabase/client";
import { usePlanner } from "./store";
import { loadRoster, Peer, useTeam } from "./team";
import { ContentCard } from "./types";

const FLUSH_IDLE_MS = 800; // quiet period after the last keystroke
const FLUSH_MAX_MS = 3000; // never wait longer than this while typing
const REMOTE_BATCH_MS = 150; // coalesce a burst of realtime events
const PARALLEL_SAVES = 8;

interface Outbox {
  dirty: string[];
  deleted: string[];
  profileDirty: boolean;
}

type ProfileData = ReturnType<typeof defaultProfileData>;

/**
 * The last version of a row that we and the cloud agreed on. `version` is the
 * row's `updated_at`, used as an optimistic-concurrency token: a save only
 * lands if the row is still at the version we started from. `card`/`data` is
 * the common ancestor for a three-way merge when it isn't.
 */
interface CardBase {
  version: string;
  card: ContentCard;
}

interface SyncSession {
  userId: string;
  profileId: string;
  supabase: SupabaseClient;
  dirty: Set<string>;
  deleted: Set<string>;
  profileDirty: boolean;
  base: Map<string, CardBase>;
  profileBase: { version: string; data: ProfileData } | null;
  channel: RealtimeChannel | null;
  /** Card ids a realtime event told us changed, awaiting one batched fetch. */
  remoteQueue: Set<string>;
  remoteTimer: ReturnType<typeof setTimeout> | null;
  /** The card this user has open — broadcast to teammates. */
  openCardId: string | null;
  unsubscribes: (() => void)[];
  idleTimer: ReturnType<typeof setTimeout> | null;
  maxTimer: ReturnType<typeof setTimeout> | null;
  /** Suppresses change-tracking while we write cloud data into the stores. */
  hydrating: boolean;
  flushing: Promise<void> | null;
}

let session: SyncSession | null = null;

/** Set once the user is signed in; null means local-only mode. */
let cloudUserId: string | null = null;
let cloudUserEmail: string | null = null;

export function setCloudUser(id: string | null, email: string | null = null) {
  cloudUserId = id;
  cloudUserEmail = email;
  useTeam.setState({ me: id ? { id, email: email ?? "" } : null });
}

export function getCloudUser(): string | null {
  return cloudUserId;
}

export function getCloudEmail(): string | null {
  return cloudUserEmail;
}

export function isSyncing(): boolean {
  return session !== null;
}

/** Timestamps round-trip as "…Z" or "…+00:00"; compare the instant. */
function sameVersion(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a === b || Date.parse(a) === Date.parse(b);
}

function profileDataOf(p: ProfileData): ProfileData {
  return {
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
    showBrainstorm: p.showBrainstorm,
    pipelines: p.pipelines,
    inspo: p.inspo,
    competitors: p.competitors,
  };
}

/**
 * Keys added to the profile blob after launch. A window still running an older
 * build writes the blob WITHOUT them (it lists the keys it knows), silently
 * wiping e.g. someone's customised pipelines. A blob that lacks the key
 * entirely can only be that — a current build always writes it — so the value
 * is put back from what we last knew, and re-saved.
 */
const LATE_KEYS = ["pipelines", "showBrainstorm"] as const;

function restoreDroppedKeys(
  raw: object,
  lastKnown: Partial<ProfileData> | null | undefined
): { patch: Partial<ProfileData>; restored: boolean } {
  const patch: Record<string, unknown> = {};
  if (!lastKnown || isReadOnly()) return { patch, restored: false };
  const defaults = defaultProfileData() as Record<string, unknown>;
  for (const k of LATE_KEYS) {
    const known = (lastKnown as Record<string, unknown>)[k];
    if (k in raw || known === undefined) continue;
    if (!deepEqual(known, defaults[k])) patch[k] = known;
  }
  return { patch: patch as Partial<ProfileData>, restored: Object.keys(patch).length > 0 };
}

/** This profile's locally cached copy (zustand's persist envelope), if any. */
function cachedProfile(profileId: string): Partial<ProfileData> | null {
  try {
    const rawEnv = localStorage.getItem(profileKey(profileId));
    return rawEnv ? ((JSON.parse(rawEnv) as { state?: Partial<ProfileData> }).state ?? null) : null;
  } catch {
    return null;
  }
}

/** Write cloud state into a store without it counting as a local edit. */
function quietly(s: SyncSession, write: () => void) {
  const was = s.hydrating;
  s.hydrating = true;
  try {
    write();
  } finally {
    s.hydrating = was;
  }
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

/**
 * Someone else saved this card since we last saw it. Fold their version into
 * ours and leave the result dirty: the next flush writes it from the new base.
 */
function reconcileCard(s: SyncSession, row: CardRow) {
  const theirs = rowToCard(row);
  const ours = usePlanner.getState().cards.find((c) => c.id === row.id);
  const prior = s.base.get(row.id);
  s.base.set(row.id, { version: row.updated_at, card: theirs });
  if (!ours) return;

  const merged = mergeCard(prior?.card, ours, theirs);
  quietly(s, () =>
    usePlanner.setState({
      cards: usePlanner.getState().cards.map((c) => (c.id === row.id ? merged : c)),
    })
  );
  s.dirty.add(row.id);
}

/** Save one card that the cloud already has, guarded by its version. */
async function saveKnownCard(s: SyncSession, card: ContentCard, known: CardBase) {
  const row = cardToRow(card, s.userId, s.profileId);
  const { data, error } = await s.supabase
    .from("cards")
    .update(row)
    .eq("id", card.id)
    .eq("updated_at", known.version)
    .select("id");
  if (error) throw error;

  if (data?.length) {
    s.base.set(card.id, { version: row.updated_at, card });
    return;
  }

  // Version moved on (or the row is gone). Look before overwriting.
  const { data: current, error: readErr } = await s.supabase
    .from("cards")
    .select("*")
    .eq("id", card.id)
    .maybeSingle();
  if (readErr) throw readErr;

  const remote = current as CardRow | null;
  if (!remote || remote.deleted_at) {
    // Deleted elsewhere while we were editing it. An edit is the stronger
    // signal of intent, so the card comes back (upsert clears the tombstone).
    const { error: upErr } = await s.supabase.from("cards").upsert(row);
    if (upErr) throw upErr;
    s.base.set(card.id, { version: row.updated_at, card });
    return;
  }

  reconcileCard(s, remote);
}

async function saveProfile(s: SyncSession) {
  const ours = profileDataOf(useProfile.getState());
  const version = new Date().toISOString();

  let q = s.supabase
    .from("profiles")
    .update({ data: ours, updated_at: version })
    .eq("id", s.profileId);
  if (s.profileBase) q = q.eq("updated_at", s.profileBase.version);
  const { data, error } = await q.select("id");
  if (error) throw error;

  if (data?.length) {
    s.profileBase = { version, data: ours };
    return;
  }

  const { data: current, error: readErr } = await s.supabase
    .from("profiles")
    .select("*")
    .eq("id", s.profileId)
    .maybeSingle();
  if (readErr) throw readErr;
  // Unreadable means the profile was deleted or our access was removed;
  // there is nothing left to save into.
  if (!current) return;

  reconcileProfile(s, current as ProfileRow);
}

function reconcileProfile(s: SyncSession, row: ProfileRow) {
  const kept = restoreDroppedKeys(row.data ?? {}, s.profileBase?.data);
  const theirs = {
    ...defaultProfileData(),
    ...(row.data ?? {}),
    ...kept.patch,
  } as ProfileData;
  const ours = profileDataOf(useProfile.getState());
  const merged = mergeProfileData(s.profileBase?.data, ours, theirs);
  s.profileBase = { version: row.updated_at, data: theirs };
  quietly(s, () => useProfile.setState(merged));
  s.profileDirty = true;
}

/** Push all pending changes. Safe to await before switching profiles. */
export function flush(): Promise<void> {
  const s = session;
  if (!s) return Promise.resolve();
  // One at a time: two overlapping flushes would race each other's versions.
  if (s.flushing) return s.flushing.then(() => flush());
  s.flushing = doFlush(s).finally(() => {
    s.flushing = null;
  });
  return s.flushing;
}

async function doFlush(s: SyncSession): Promise<void> {
  clearTimers(s);

  const dirtyIds = [...s.dirty];
  const deletedIds = [...s.deleted];
  const wantProfile = s.profileDirty;
  if (!dirtyIds.length && !deletedIds.length && !wantProfile) return;

  // Clear optimistically; re-add on failure so the outbox retries.
  s.dirty.clear();
  s.deleted.clear();
  s.profileDirty = false;

  const byId = new Map(usePlanner.getState().cards.map((c) => [c.id, c]));
  const cards = dirtyIds
    .map((id) => byId.get(id))
    .filter((c): c is ContentCard => Boolean(c));

  // Cards the cloud hasn't seen from us go up in one request. Cards it has
  // are saved one by one, each conditional on its version.
  const fresh = cards.filter((c) => !s.base.has(c.id));
  const known = cards.filter((c) => s.base.has(c.id));

  // Track what actually landed, so a mid-flush failure only retries the rest.
  const done = new Set<string>();
  let deletesDone = false;
  let profileDone = !wantProfile;

  try {
    if (fresh.length) {
      const rows = fresh.map((c) => cardToRow(c, s.userId, s.profileId));
      const { error } = await s.supabase.from("cards").upsert(rows);
      if (error) throw error;
      rows.forEach((r, i) => {
        s.base.set(r.id, { version: r.updated_at, card: fresh[i] });
        done.add(r.id);
      });
    }

    for (let i = 0; i < known.length; i += PARALLEL_SAVES) {
      await Promise.all(
        known.slice(i, i + PARALLEL_SAVES).map(async (c) => {
          await saveKnownCard(s, c, s.base.get(c.id)!);
          done.add(c.id);
        })
      );
    }

    if (deletedIds.length) {
      // Soft delete. A hard delete would let a stale device re-insert the row.
      // `updated_at` moves too, so a teammate mid-edit conflicts instead of
      // silently saving over the tombstone.
      const now = new Date().toISOString();
      const { error } = await s.supabase
        .from("cards")
        .update({ deleted_at: now, updated_at: now })
        .in("id", deletedIds);
      if (error) throw error;
      deletedIds.forEach((id) => s.base.delete(id));
    }
    deletesDone = true;

    if (wantProfile) {
      await saveProfile(s);
      profileDone = true;
    }

    saveOutbox(s);
    // A conflict leaves its merged result dirty — write that too.
    if (s.dirty.size || s.profileDirty) scheduleFlush();
  } catch (err) {
    // Put back whatever didn't land and try again on the next change or focus.
    dirtyIds.forEach((id) => !done.has(id) && s.dirty.add(id));
    if (!deletesDone) deletedIds.forEach((id) => s.deleted.add(id));
    if (!profileDone) s.profileDirty = true;
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

  const rows = cardRows as CardRow[];
  const cards = rows.map(rowToCard);
  const prow = profileRow as ProfileRow | null;
  const kept = restoreDroppedKeys(prow?.data ?? {}, prow ? cachedProfile(profileId) : null);
  const data = {
    ...defaultProfileData(),
    ...(prow?.data ?? {}),
    ...kept.patch,
  } as ProfileData;

  const apply = () => {
    usePlanner.setState({ cards });
    useProfile.setState(data);
  };

  const s = session;
  if (s && s.profileId === profileId) {
    s.base = new Map(rows.map((r, i) => [r.id, { version: r.updated_at, card: cards[i] }]));
    s.profileBase = prow ? { version: prow.updated_at, data } : null;
    quietly(s, apply);
    // Put back in the cloud whatever an older build dropped from it.
    if (kept.restored) {
      s.profileDirty = true;
      if (!s.hydrating) scheduleFlush();
    }
  } else {
    apply();
  }
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

// ————— Live updates —————

/** Fetch the cards realtime told us about, and fold each one in. */
async function drainRemoteQueue(s: SyncSession) {
  s.remoteTimer = null;
  const ids = [...s.remoteQueue];
  s.remoteQueue.clear();
  if (!ids.length || session !== s) return;

  // Fetched rather than read off the event: a card carrying pasted images can
  // exceed the realtime payload limit, and a truncated body must never be
  // mistaken for the real one.
  const { data, error } = await s.supabase.from("cards").select("*").in("id", ids);
  if (error || session !== s) return;

  for (const row of data as CardRow[]) applyRemoteCard(s, row);
  saveOutbox(s);
  if (s.dirty.size) scheduleFlush();
}

function applyRemoteCard(s: SyncSession, row: CardRow) {
  if (sameVersion(s.base.get(row.id)?.version, row.updated_at)) return; // our own echo

  const local = usePlanner.getState().cards;
  const have = local.some((c) => c.id === row.id);

  if (row.deleted_at) {
    // Mid-edit here? Our pending save will bring it back; leave it be.
    if (s.dirty.has(row.id)) return;
    s.base.delete(row.id);
    if (have) {
      quietly(s, () =>
        usePlanner.setState({ cards: local.filter((c) => c.id !== row.id) })
      );
    }
    return;
  }

  if (s.deleted.has(row.id)) return; // we're deleting it; theirs loses

  if (have && s.dirty.has(row.id)) {
    reconcileCard(s, row);
    return;
  }

  const theirs = rowToCard(row);
  s.base.set(row.id, { version: row.updated_at, card: theirs });
  quietly(s, () =>
    usePlanner.setState({
      cards: have
        ? local.map((c) => (c.id === row.id ? theirs : c))
        : [theirs, ...local],
    })
  );
}

function queueRemote(s: SyncSession, id: string) {
  s.remoteQueue.add(id);
  s.remoteTimer ??= setTimeout(() => void drainRemoteQueue(s), REMOTE_BATCH_MS);
}

async function applyRemoteProfile(s: SyncSession) {
  const { data, error } = await s.supabase
    .from("profiles")
    .select("*")
    .eq("id", s.profileId)
    .maybeSingle();
  if (error || !data || session !== s) return;
  const row = data as ProfileRow;
  if (sameVersion(s.profileBase?.version, row.updated_at)) return;

  if (s.profileDirty) {
    reconcileProfile(s, row);
    scheduleFlush();
    return;
  }
  const kept = restoreDroppedKeys(row.data ?? {}, s.profileBase?.data);
  const theirs = {
    ...defaultProfileData(),
    ...(row.data ?? {}),
    ...kept.patch,
  } as ProfileData;
  s.profileBase = { version: row.updated_at, data: theirs };
  quietly(s, () => useProfile.setState(theirs));
  if (kept.restored) {
    s.profileDirty = true;
    scheduleFlush();
  }
}

/**
 * Anything that changed while we weren't listening — tab asleep, laptop shut,
 * socket dropped. Compares versions only, then fetches just what moved.
 */
async function catchUp(s: SyncSession) {
  const { data, error } = await s.supabase
    .from("cards")
    .select("id,updated_at,deleted_at")
    .eq("profile_id", s.profileId);
  if (error || session !== s) return;

  for (const r of data as Pick<CardRow, "id" | "updated_at" | "deleted_at">[]) {
    const known = s.base.get(r.id);
    if (!known && r.deleted_at) continue; // a tombstone we never had
    if (!sameVersion(known?.version, r.updated_at)) queueRemote(s, r.id);
  }
  await applyRemoteProfile(s);
}

function publishPresence(s: SyncSession) {
  if (!s.channel) return;
  void s.channel.track({
    userId: s.userId,
    email: cloudUserEmail ?? "",
    cardId: s.openCardId,
  });
}

/** Tell teammates which card is open here (null when the editor closes). */
export function setOpenCard(cardId: string | null) {
  const s = session;
  if (!s || s.openCardId === cardId) return;
  s.openCardId = cardId;
  publishPresence(s);
}

function subscribeLive(s: SyncSession) {
  let subscribedOnce = false;

  const channel = s.supabase
    .channel(`profile:${s.profileId}`, {
      config: { presence: { key: s.userId } },
    })
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "cards",
        filter: `profile_id=eq.${s.profileId}`,
      },
      (payload) => {
        const row = payload.new as Partial<CardRow> | null;
        if (!row?.id) return;
        if (sameVersion(s.base.get(row.id)?.version, row.updated_at)) return;
        queueRemote(s, row.id);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${s.profileId}`,
      },
      (payload) => {
        const row = payload.new as Partial<ProfileRow> | null;
        if (sameVersion(s.profileBase?.version, row?.updated_at)) return;
        void applyRemoteProfile(s);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "profile_members",
        filter: `profile_id=eq.${s.profileId}`,
      },
      () => void loadRoster(s.profileId)
    )
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<Peer>();
      const peers: Peer[] = [];
      for (const metas of Object.values(state)) {
        // Several tabs from one person collapse into one peer; prefer the
        // tab that has a card open.
        const meta = metas.find((m) => m.cardId) ?? metas[0];
        if (!meta || meta.userId === s.userId) continue;
        peers.push({ userId: meta.userId, email: meta.email, cardId: meta.cardId ?? null });
      }
      useTeam.setState({ peers });
    })
    .subscribe((status) => {
      if (status !== "SUBSCRIBED" || session !== s) return;
      publishPresence(s);
      // A RE-subscribe means the socket dropped: events were missed.
      if (subscribedOnce) void catchUp(s);
      subscribedOnce = true;
    });

  s.channel = channel;
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

  const onFocus = () => {
    void flush().then(() => {
      if (session === s) void catchUp(s);
    });
  };
  const onUnload = () => void flush();
  window.addEventListener("focus", onFocus);
  window.addEventListener("beforeunload", onUnload);

  s.unsubscribes.push(unsubCards, unsubProfile, () => {
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("beforeunload", onUnload);
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
    base: new Map(),
    profileBase: null,
    channel: null,
    remoteQueue: new Set(),
    remoteTimer: null,
    openCardId: null,
    unsubscribes: [],
    idleTimer: null,
    maxTimer: null,
    hydrating: true,
    flushing: null,
  };
  session = s;

  await pull(supabase, profileId);

  // Replay anything a previous session failed to write (e.g. offline delete).
  // A viewer has nothing to replay: the cloud would reject it forever.
  if (!isReadOnly()) {
    const box = loadOutbox(profileId);
    box.dirty.forEach((id) => s.dirty.add(id));
    box.deleted.forEach((id) => s.deleted.add(id));
    // `||`: the pull above may already have flagged a restore.
    s.profileDirty = s.profileDirty || box.profileDirty;
  }

  s.hydrating = false;
  attachSubscriptions(s);
  subscribeLive(s);

  if (s.dirty.size || s.deleted.size || s.profileDirty) await flush();
}

/** Drain pending writes and detach. */
export async function stopSync() {
  const s = session;
  if (!s) return;
  await flush();
  clearTimers(s);
  if (s.remoteTimer) clearTimeout(s.remoteTimer);
  s.unsubscribes.forEach((fn) => fn());
  if (s.channel) void s.supabase.removeChannel(s.channel);
  useTeam.setState({ peers: [] });
  session = null;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccounts } from "./accounts";
import { isDone, Pipeline, pipelineOf, stageOf } from "./pipelines";
import { openNotes } from "./review";
import { getSupabaseBrowser } from "./supabase/client";
import { useTeam } from "./team";
import { ContentCard, Who } from "./types";

/**
 * How each person views a board or the table: their filters, their sort, and
 * their own manual card order. Deliberately PERSONAL and never synced — an
 * editor filtering to "Mine" must not change what the owner sees. (What IS
 * shared is the work itself: status, assignees, content.)
 *
 * Stored per user × profile × view: on the device for an instant paint, and
 * in `view_prefs` (readable only by its owner) so every device you sign in
 * on shows the same views. Newest change wins.
 */

export type PostingFilter = "week" | "month" | "overdue" | "none";

/** "__none" in a list means "cards with no value for this field". */
export const NONE = "__none";

export interface Filters {
  mine?: boolean;
  assignees?: string[];
  buckets?: string[];
  formats?: string[];
  posting?: PostingFilter;
  openNotes?: boolean;
  who?: Who[];
  topics?: string[];
  lenses?: string[];
  feelings?: string[];
  actions?: string[];
  /** All Content only — a board is already one pipeline. */
  pipelines?: string[];
  /** All Content only, by step NAME, since each pipeline has its own step ids. */
  statuses?: string[];
}

export type BoardSort = "manual" | "newest" | "oldest" | "title" | "posting" | "edited";

export type TableSortKey =
  | "title"
  | "status"
  | "pipeline"
  | "format"
  | "bucket"
  | "assigned"
  | "posting"
  | "added";

export interface ViewPrefs {
  filters: Filters;
  sort: BoardSort;
  table?: { key: TableSortKey; dir: 1 | -1 } | null;
  /** Manual order: column id → card ids, top to bottom. */
  order: Record<string, string[]>;
  /** When these were last changed — how devices decide whose copy wins. */
  at?: string;
}

const EMPTY: ViewPrefs = { filters: {}, sort: "manual", table: null, order: {} };

function load(key: string): ViewPrefs {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<ViewPrefs>) };
  } catch {
    /* ignore */
  }
  return EMPTY;
}

function saveLocal(key: string, prefs: ViewPrefs) {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    /* private mode: works for this session only */
  }
}

// ————— Cloud copy —————
// Debounced per key: dragging cards around fires many updates in a row.
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function pushRemote(uid: string, remoteKey: string, prefs: ViewPrefs) {
  if (uid === "local") return;
  const t = pushTimers.get(remoteKey);
  if (t) clearTimeout(t);
  pushTimers.set(
    remoteKey,
    setTimeout(() => {
      pushTimers.delete(remoteKey);
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      void supabase
        .from("view_prefs")
        .upsert({ user_id: uid, key: remoteKey, prefs, updated_at: prefs.at })
        .then(() => {}); // missing table (migration not run) → local-only, silently
    }, 600)
  );
}

async function pullRemote(remoteKey: string): Promise<ViewPrefs | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("view_prefs")
    .select("prefs,updated_at")
    .eq("key", remoteKey)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { prefs: Partial<ViewPrefs>; updated_at: string };
  return { ...EMPTY, ...row.prefs, at: row.updated_at };
}

const newer = (a: string | undefined, b: string | undefined) =>
  Boolean(a) && (!b || Date.parse(a!) > Date.parse(b));

/** This person's prefs for a view, re-read when the view/profile/user changes. */
export function useViewPrefs(viewId: string) {
  const uid = useTeam((s) => s.me?.id ?? "local");
  const pid = useAccounts((s) => s.activeId);
  const key = `cf-view:${uid}:${pid}:${viewId}`;
  const remoteKey = `${pid}:${viewId}`;
  const [state, setState] = useState(() => ({ key, prefs: load(key) }));
  // Reset during render when the key changes (React's "adjust state on prop
  // change" pattern) so a board never paints with another board's filters.
  let current = state;
  if (state.key !== key) {
    current = { key, prefs: load(key) };
    setState(current);
  }

  // Adopt the cloud copy when another device changed it more recently — on
  // open, and whenever this window comes back into focus.
  useEffect(() => {
    if (uid === "local") return;
    let live = true;
    const sync = () =>
      void pullRemote(remoteKey).then((remote) => {
        if (!live || !remote) return;
        setState((s) => {
          if (s.key !== key) return s;
          if (newer(remote.at, s.prefs.at)) {
            saveLocal(key, remote);
            return { key, prefs: remote };
          }
          // Ours is newer (changed offline, or before the table existed):
          // send it up instead.
          if (newer(s.prefs.at, remote.at)) pushRemote(uid, remoteKey, s.prefs);
          return s;
        });
      });
    sync();
    window.addEventListener("focus", sync);
    return () => {
      live = false;
      window.removeEventListener("focus", sync);
    };
  }, [uid, key, remoteKey]);

  const update = useCallback(
    (fn: (p: ViewPrefs) => ViewPrefs) => {
      setState((s) => {
        const next = { ...fn(s.prefs), at: new Date().toISOString() };
        saveLocal(s.key, next);
        pushRemote(uid, remoteKey, next);
        return { ...s, prefs: next };
      });
    },
    [uid, remoteKey]
  );

  return [current.prefs, update] as const;
}

export function activeFilterCount(f: Filters): number {
  let n = 0;
  for (const [k, v] of Object.entries(f)) {
    if (k === "mine") continue; // shown by its own toggle
    if (Array.isArray(v) ? v.length > 0 : Boolean(v)) n++;
  }
  return n;
}

function inList(list: string[] | undefined, value: string | undefined): boolean {
  if (!list || list.length === 0) return true;
  return list.includes(value && value !== "" ? value : NONE);
}

const DAY = 86_400_000;

function matchesPosting(c: ContentCard, f: PostingFilter, pipelines: Pipeline[]): boolean {
  if (f === "none") return !c.postingDate;
  if (!c.postingDate) return false;
  const today = new Date(new Date().toDateString()).getTime();
  const d = new Date(c.postingDate + "T00:00:00").getTime();
  if (f === "overdue") return d < today && !isDone(c, pipelines);
  if (f === "week") return d >= today && d < today + 7 * DAY;
  return d >= today && d < today + 30 * DAY;
}

export function applyFilters(
  cards: ContentCard[],
  f: Filters,
  ctx: { me: string | null; pipelines: Pipeline[] }
): ContentCard[] {
  const me = ctx.me?.toLowerCase() ?? null;
  return cards.filter((c) => {
    const who = c.assignees ?? [];
    if (f.mine && me && !who.includes(me)) return false;
    if (f.assignees?.length) {
      const hit = f.assignees.some((a) => (a === NONE ? who.length === 0 : who.includes(a)));
      if (!hit) return false;
    }
    if (!inList(f.buckets, c.bucketId)) return false;
    if (!inList(f.formats, c.format)) return false;
    if (!inList(f.who, c.who)) return false;
    if (!inList(f.topics, c.topic)) return false;
    if (!inList(f.lenses, c.pillar)) return false;
    if (!inList(f.feelings, c.feeling)) return false;
    if (!inList(f.actions, c.action)) return false;
    if (f.posting && !matchesPosting(c, f.posting, ctx.pipelines)) return false;
    if (f.openNotes && openNotes(c.review) === 0) return false;
    if (f.pipelines?.length && !f.pipelines.includes(pipelineOf(c, ctx.pipelines)?.id ?? "")) {
      return false;
    }
    if (f.statuses?.length && !f.statuses.includes(stageOf(c, ctx.pipelines)?.name ?? "")) {
      return false;
    }
    return true;
  });
}

const byTitle = (a: ContentCard, b: ContentCard) => {
  // Untitled cards sink rather than leading an A–Z list.
  if (!a.title.trim() !== !b.title.trim()) return a.title.trim() ? -1 : 1;
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
};
const newest = (a: ContentCard, b: ContentCard) => (a.createdAt < b.createdAt ? 1 : -1);

/** Order one column's cards. Manual: the saved order, with cards it hasn't
 *  seen yet (new ones) on top, newest first — the old default. */
export function sortColumn(
  cards: ContentCard[],
  sort: BoardSort,
  manual: string[] | undefined
): ContentCard[] {
  const list = [...cards];
  switch (sort) {
    case "newest":
      return list.sort(newest);
    case "oldest":
      return list.sort((a, b) => -newest(a, b));
    case "title":
      return list.sort(byTitle);
    case "edited":
      return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    case "posting":
      return list.sort((a, b) => {
        if (!a.postingDate !== !b.postingDate) return a.postingDate ? -1 : 1;
        return (a.postingDate ?? "").localeCompare(b.postingDate ?? "") || newest(a, b);
      });
    default: {
      const rank = new Map((manual ?? []).map((id, i) => [id, i]));
      return list.sort((a, b) => {
        const ra = rank.get(a.id);
        const rb = rank.get(b.id);
        if (ra === undefined && rb === undefined) return newest(a, b);
        if (ra === undefined) return -1;
        if (rb === undefined) return 1;
        return ra - rb;
      });
    }
  }
}

/**
 * Place `ids` into a column's full order, just before `beforeId` (a card that
 * was visible at the drop point) or just after `afterId` (the last visible
 * card, when dropped at the bottom). Hidden (filtered-out) cards keep their
 * positions relative to everything else.
 */
export function placeInOrder(
  full: string[],
  ids: string[],
  beforeId: string | null,
  afterId: string | null
): string[] {
  const moving = new Set(ids);
  const rest = full.filter((id) => !moving.has(id));
  let at = rest.length;
  if (beforeId && rest.includes(beforeId)) at = rest.indexOf(beforeId);
  else if (afterId && rest.includes(afterId)) at = rest.indexOf(afterId) + 1;
  rest.splice(at, 0, ...ids);
  return rest;
}

export const BOARD_SORT_LABEL: Record<BoardSort, string> = {
  manual: "Manual",
  newest: "Newest first",
  oldest: "Oldest first",
  title: "Title A–Z",
  posting: "Posting date",
  edited: "Recently edited",
};

export const POSTING_LABEL: Record<PostingFilter, string> = {
  week: "Next 7 days",
  month: "Next 30 days",
  overdue: "Overdue",
  none: "No date",
};

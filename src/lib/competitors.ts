"use client";

/**
 * Competitor research: channels you want to study, and their video walls.
 *
 * Split storage on purpose. The competitor LIST is what the user authored, so
 * it rides in the profile store — per account, synced, offline-safe. The video
 * snapshots are derived data that YouTube can regenerate on demand, so they
 * live in a local cache instead of being pushed to the cloud on every edit.
 * (The handoff doc sketches Supabase tables for these; that shape earns its
 * keep in Phase 3, when weekly refreshes need history to diff against.)
 */

export interface Competitor {
  id: string;
  channelId: string;
  name: string;
  handle?: string | null;
  subscribersText?: string | null;
  videoCountText?: string | null;
  addedAt: string;
}

export interface CompetitorVideo {
  videoId: string;
  title: string;
  durationSec: number | null;
  views: number | null;
  published: string | null;
  publishedText: string | null;
  publishedExact: boolean;
  inRecent: boolean;
  inTop: boolean;
  /** Came from the channel's Shorts tab (no duration is published there). */
  isShort?: boolean;
  /** Views ÷ the channel's median, measured within this video's own format. */
  multiple: number | null;
}

export interface CompetitorSnapshot {
  channelId: string;
  channelName: string | null;
  fetchedAt: string;
  medianViews: number;
  shortMedianViews?: number;
  counts: { recent: number; top: number; shorts?: number; total: number };
  videos: CompetitorVideo[];
}

/** Short form is a duration call, not a YouTube label — Shorts and any tight
 *  edit under three minutes behave the same way for planning purposes. */
export const SHORT_MAX_SEC = 180;

/**
 * Three tiers, because one threshold can't serve both sorts.
 *
 * Recent uploads are what set the median, so barely any of them can be 3x it —
 * sorted by Newest you'd scroll past an unbroken run of unmarked tiles. But a
 * recent video at 1.9x its channel's normal is exactly the thing worth
 * noticing. So: NOTE marks "did better than usual", MIN marks a real outlier,
 * STRONG marks the runaway hits that dominate the Most-viewed sort.
 */
export const OUTLIER_NOTE = 1.5;
export const OUTLIER_MIN = 3;
export const OUTLIER_STRONG = 10;

export function isShort(v: CompetitorVideo): boolean {
  if (v.isShort) return true;
  return v.durationSec !== null && v.durationSec <= SHORT_MAX_SEC;
}

export function formatViews(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n);
}

export function formatDuration(sec: number | null): string {
  if (sec === null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** "3 days ago" style, preferring YouTube's own wording when we have it. */
export function formatAge(v: CompetitorVideo, now = Date.now()): string {
  if (!v.publishedExact && v.publishedText) return v.publishedText;
  if (!v.published) return "";
  const days = Math.floor((now - new Date(v.published).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  const y = Math.floor(days / 365);
  return `${y}y ago`;
}

export function thumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// ————— Snapshot cache —————
// Derived data, so it stays local: cheap to rebuild, never worth syncing.

const CACHE_PREFIX = "cf-comp:";

export function loadSnapshot(channelId: string): CompetitorSnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + channelId);
    return raw ? (JSON.parse(raw) as CompetitorSnapshot) : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(snap: CompetitorSnapshot): void {
  try {
    localStorage.setItem(CACHE_PREFIX + snap.channelId, JSON.stringify(snap));
  } catch {
    /* quota or private mode — the wall still works, it just refetches */
  }
}

export function clearSnapshot(channelId: string): void {
  try {
    localStorage.removeItem(CACHE_PREFIX + channelId);
  } catch {
    /* nothing to do */
  }
}

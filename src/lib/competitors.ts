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
  /** Posted recently enough that its view count is still climbing. */
  fresh?: boolean;
  /** "fresh" = scored against same-age uploads; "all" = the full catalogue. */
  basis?: "fresh" | "all";
  /** Views ÷ the channel's median, measured within this video's own format.
   *  Null on a fresh upload with no same-age peers to compare against. */
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
  /** Exact view counts from the pull before this one — what "views per hour
   *  RIGHT NOW" is measured against. Only videos with exact counts. */
  prev?: { fetchedAt: string; views: Record<string, number> };
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

// ————— Views per hour —————

/** How long a gap between two pulls can honestly be called "right now". */
const VPH_MIN_GAP_H = 0.5;
const VPH_MAX_GAP_H = 72;
/** Past this age a lifetime average says nothing about momentum. */
const VPH_MAX_AGE_DAYS = 30;

export interface Velocity {
  vph: number;
  /** "now": gained between our last two pulls. "avg": lifetime average. */
  kind: "now" | "avg";
  /** Hours the rate was measured over. */
  hours: number;
  /** True when the publish time is YouTube's rounded "3 days ago". */
  approx: boolean;
}

/**
 * Views per hour, the "is this one taking off?" number.
 *
 * Best case it's a real measurement: views gained between the previous pull
 * and this one, which is what a tracker like vidIQ reports. That needs two
 * pulls, and exact counts — which YouTube only gives for a channel's latest
 * uploads (the ones where it matters). Until then, or for anything we've only
 * seen once, it's the lifetime average: views ÷ hours since publishing, shown
 * only for uploads under a month old, where that still reflects momentum.
 */
export function velocityOf(
  v: CompetitorVideo,
  snap: Pick<CompetitorSnapshot, "fetchedAt" | "prev">
): Velocity | null {
  if (v.views === null) return null;
  const fetched = Date.parse(snap.fetchedAt);

  const before = v.publishedExact ? snap.prev?.views[v.videoId] : undefined;
  if (before !== undefined && snap.prev) {
    const hours = (fetched - Date.parse(snap.prev.fetchedAt)) / 3_600_000;
    if (hours >= VPH_MIN_GAP_H && hours <= VPH_MAX_GAP_H && v.views >= before) {
      const vph = (v.views - before) / hours;
      // An old video idling at a view or two an hour isn't news; say nothing.
      return vph >= 1 ? { vph, kind: "now", hours, approx: false } : null;
    }
  }

  if (!v.published) return null;
  const hours = Math.max((fetched - Date.parse(v.published)) / 3_600_000, 1);
  if (hours > VPH_MAX_AGE_DAYS * 24) return null;
  const vph = v.views / hours;
  return vph >= 1 ? { vph, kind: "avg", hours, approx: !v.publishedExact } : null;
}

export function formatVph(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  if (n >= 10) return String(Math.round(n));
  return n.toFixed(1);
}

/**
 * Saving also rolls the outgoing snapshot's exact counts into `prev`, so the
 * next render can measure the change. A re-pull within half an hour keeps the
 * OLDER baseline instead — otherwise mashing Refresh would leave nothing but
 * a too-short gap to measure over.
 */
export function saveSnapshot(snap: CompetitorSnapshot): void {
  const old = loadSnapshot(snap.channelId);
  if (old) {
    const gapH = (Date.parse(snap.fetchedAt) - Date.parse(old.fetchedAt)) / 3_600_000;
    if (gapH >= VPH_MIN_GAP_H || !old.prev) {
      const views: Record<string, number> = {};
      for (const v of old.videos) {
        if (v.publishedExact && v.views !== null) views[v.videoId] = v.views;
      }
      snap.prev = { fetchedAt: old.fetchedAt, views };
    } else {
      snap.prev = old.prev;
    }
  }
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

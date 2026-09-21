import { parseYouTubeId } from "./inspo";

/**
 * Video review: paste a link to a cut, watch it on the card, leave notes pinned
 * to moments in it. Frame.io's core loop, without hosting a byte of video.
 *
 * Only three hosts, on purpose. A timestamped comment needs the page to READ
 * the player's position and SEEK it, and these are the ones that allow it:
 * YouTube and Vimeo publish player APIs, and a Dropbox share link can be
 * streamed as a plain <video>. Google Drive's embed and Frame.io expose
 * neither, so a link to them could only ever be a link — better to say so up
 * front than to offer a review tab whose timestamps don't work.
 */

export type ReviewProvider = "youtube" | "vimeo" | "dropbox";

export interface ReviewComment {
  id: string;
  /** Seconds into the video; null for a general note about the whole cut. */
  time: number | null;
  text: string;
  /** Email of whoever wrote it ("" when running signed-out). */
  author: string;
  createdAt: string;
  resolved?: boolean;
}

/** One uploaded cut. Comments belong to the cut they were made on. */
export interface ReviewVersion {
  id: string;
  url: string;
  provider: ReviewProvider;
  addedAt: string;
  addedBy: string;
  comments: ReviewComment[];
}

export interface CardReview {
  versions: ReviewVersion[];
}

export type ReviewSource =
  | { provider: "youtube"; videoId: string }
  | { provider: "vimeo"; videoId: string; hash: string | null }
  | { provider: "dropbox"; src: string };

export const PROVIDER_LABEL: Record<ReviewProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  dropbox: "Dropbox",
};

function toUrl(input: string): URL | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

/** What to play for a pasted link, or null if it's not one of the three hosts. */
export function parseReviewUrl(input: string): ReviewSource | null {
  const yt = parseYouTubeId(input);
  if (yt && /youtu/i.test(input)) return { provider: "youtube", videoId: yt };

  const u = toUrl(input);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, "");

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    // vimeo.com/123 · vimeo.com/123/abcdef (unlisted) · player.vimeo.com/video/123?h=abcdef
    // · vimeo.com/user/review/123/abcdef · vimeo.com/channels/x/123
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.findIndex((p) => /^\d{6,}$/.test(p));
    if (i === -1) return null;
    const next = parts[i + 1];
    const hash = u.searchParams.get("h") ?? (next && /^[0-9a-f]{6,}$/i.test(next) ? next : null);
    return { provider: "vimeo", videoId: parts[i], hash };
  }

  if (host === "dropbox.com" || host === "dl.dropboxusercontent.com") {
    // A FILE share link (/s/… or /scl/fi/…). Folder links (/sh/, /scl/fo/)
    // have nothing to stream.
    if (/^\/(sh|scl\/fo)\//.test(u.pathname)) return null;
    if (host === "dropbox.com" && !/^\/(s|scl\/fi)\//.test(u.pathname)) return null;
    // `raw=1` serves the file itself (with range requests, so seeking works)
    // instead of Dropbox's preview page.
    u.searchParams.delete("dl");
    u.searchParams.set("raw", "1");
    return { provider: "dropbox", src: u.toString() };
  }

  return null;
}

/** 83 → "1:23", 3723 → "1:02:03". */
export function formatTimecode(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
}

/** Timed notes in playback order, then the general ones, oldest first. */
export function sortComments(comments: ReviewComment[]): ReviewComment[] {
  return [...comments].sort((a, b) => {
    if (a.time === null && b.time === null) return a.createdAt.localeCompare(b.createdAt);
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time || a.createdAt.localeCompare(b.createdAt);
  });
}

/** Unresolved notes on the latest cut — the number worth showing on a card. */
export function openNotes(review: CardReview | undefined): number {
  const latest = review?.versions[review.versions.length - 1];
  return latest ? latest.comments.filter((c) => !c.resolved).length : 0;
}

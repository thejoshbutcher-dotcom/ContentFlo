/**
 * The Inspiration library — a swipe file of other people's videos to model.
 *
 * Items are deliberately tiny: a YouTube video id plus text. The thumbnail is
 * never copied, it's hotlinked from YouTube's CDN at a URL derived from the id,
 * so a library of thousands of items costs a few hundred KB and syncs like any
 * other profile setting. (Everything else in the app inlines images as base64,
 * which would not survive a library this size.)
 */

export interface InspoItem {
  id: string;
  /** Only YouTube for now — its thumbnails are public and permanent. */
  source: "youtube";
  videoId: string;
  url: string;
  title: string;
  channel?: string;
  /** Freeform: style ("big face", "before/after") and topic both live here. */
  tags: string[];
  note?: string;
  addedAt: string;
}

/** A library item pinned to a card section as a reference. */
export interface SectionRef {
  id: string;
  inspoId?: string;
  title: string;
  url: string;
  thumbUrl: string;
  channel?: string;
}

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Pull the video id out of any YouTube URL shape — watch, youtu.be, shorts,
 * embed, live — ignoring playlists, timestamps and tracking params.
 */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (ID_RE.test(raw)) return raw; // a bare id pasted on its own

  let u: URL;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!YT_HOSTS.has(u.hostname)) return null;

  if (u.hostname.endsWith("youtu.be")) {
    const id = u.pathname.slice(1).split("/")[0];
    return ID_RE.test(id) ? id : null;
  }

  const v = u.searchParams.get("v");
  if (v && ID_RE.test(v)) return v;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && ["shorts", "embed", "live", "v"].includes(parts[0])) {
    return ID_RE.test(parts[1]) ? parts[1] : null;
  }
  return null;
}

/**
 * A pasted link that stands for MANY videos: a playlist, or a channel whose
 * uploads we can read. Returns the validated id the server rebuilds its
 * request from — never the user's host or path.
 */
export function parseCollectionUrl(
  input: string
): { kind: "playlist" | "channel"; id: string } | null {
  const raw = input.trim();
  if (!raw) return null;

  let u: URL;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!YT_HOSTS.has(u.hostname)) return null;

  // A watch URL carrying &list= means BOTH — the caller decides via
  // parseWatchPlaylist, since only the user knows which they meant.
  if (u.pathname === "/watch") return null;

  const list = u.searchParams.get("list");
  if (list && /^[A-Za-z0-9_-]{2,64}$/.test(list)) {
    return { kind: "playlist", id: list };
  }

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0]?.startsWith("@") && /^@[A-Za-z0-9._-]{1,60}$/.test(parts[0])) {
    return { kind: "channel", id: parts[0] };
  }
  if (parts[0] === "channel" && /^UC[A-Za-z0-9_-]{22}$/.test(parts[1] ?? "")) {
    return { kind: "channel", id: `channel/${parts[1]}` };
  }
  return null;
}

/**
 * Clicking a video inside a playlist gives you `watch?v=…&list=…`, which is
 * the link most people actually end up copying. It names a video AND a
 * playlist, so we surface both and let the user pick rather than guessing.
 *
 * Returns null for playlists that aren't really collections: RD… mixes are
 * generated on the fly by YouTube, and WL / LL / HL are private to the account.
 */
export function parseWatchPlaylist(input: string): string | null {
  const raw = input.trim();
  let u: URL;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!YT_HOSTS.has(u.hostname)) return null;
  const list = u.searchParams.get("list");
  if (!list || !/^[A-Za-z0-9_-]{2,64}$/.test(list)) return null;
  if (/^(RD|WL|LL|HL)/i.test(list)) return null;
  return list;
}

export function playlistUrlFor(listId: string): string {
  return `https://www.youtube.com/playlist?list=${listId}`;
}

/** Every URL-ish token in a blob of pasted text, so many links can go in at once. */
export function extractLinks(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** YouTube's CDN. hqdefault always exists; maxres often doesn't. */
export function thumbUrlFor(videoId: string, big = false): string {
  return `https://i.ytimg.com/vi/${videoId}/${big ? "maxresdefault" : "hqdefault"}.jpg`;
}

export function watchUrlFor(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Tag universe for the filter bar, most-used first. */
export function allTags(items: InspoItem[]): string[] {
  const counts = new Map<string, number>();
  items.forEach((i) =>
    i.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1))
  );
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
}

/** Starting points offered when the library is empty of tags. */
export const TAG_SUGGESTIONS = [
  "big face",
  "before/after",
  "text heavy",
  "list",
  "arrow/circle",
  "curiosity gap",
  "number",
  "bold claim",
  "format",
  "storytelling",
];

export function matchesQuery(item: InspoItem, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    item.title.toLowerCase().includes(needle) ||
    (item.channel ?? "").toLowerCase().includes(needle) ||
    (item.note ?? "").toLowerCase().includes(needle) ||
    item.tags.some((t) => t.toLowerCase().includes(needle))
  );
}

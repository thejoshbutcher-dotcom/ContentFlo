/**
 * Server-side YouTube reading, no API key.
 *
 * Same security posture as the inspiration routes: every input is parsed and
 * validated into a channel id or handle first, and request URLs are rebuilt
 * from that — a caller can never point these at an arbitrary host.
 *
 * YouTube ships this data inside the page's `ytInitialData` blob rather than as
 * markup, and it renames the renderers periodically (the video tiles are
 * `lockupViewModel` and the sort tabs `chipViewModel` as of Aug 2026). Parsing
 * is written defensively so a rename degrades to "no results" instead of a
 * crash — worth remembering when this eventually goes quiet.
 */

export const YT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_RE = /^@[A-Za-z0-9._-]{1,60}$/;

const YT_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

export type ChannelTarget =
  | { kind: "id"; id: string }
  | { kind: "handle"; handle: string };

/**
 * Accepts what a person would actually paste: an @handle, a channel URL, a
 * /channel/UC… URL, or a bare channel id. Anything else is rejected.
 */
export function parseChannelInput(input: string): ChannelTarget | null {
  const raw = input.trim();
  if (!raw) return null;
  if (CHANNEL_ID_RE.test(raw)) return { kind: "id", id: raw };
  if (HANDLE_RE.test(raw)) return { kind: "handle", handle: raw };

  let u: URL;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    // Not a URL — maybe a bare handle without the @
    if (/^[A-Za-z0-9._-]{2,60}$/.test(raw)) return { kind: "handle", handle: `@${raw}` };
    return null;
  }
  if (!YT_HOSTS.has(u.hostname)) return null;

  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0]?.startsWith("@") && HANDLE_RE.test(parts[0])) {
    return { kind: "handle", handle: parts[0] };
  }
  if (parts[0] === "channel" && CHANNEL_ID_RE.test(parts[1] ?? "")) {
    return { kind: "id", id: parts[1] };
  }
  return null;
}

/** The canonical /videos URL for a target, built from validated pieces only. */
export function channelVideosUrl(t: ChannelTarget): string {
  return t.kind === "id"
    ? `https://www.youtube.com/channel/${t.id}/videos`
    : `https://www.youtube.com/${t.handle}/videos`;
}

export async function fetchText(url: string, timeoutMs = 15000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": YT_UA, "accept-language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Pull a JSON blob (ytInitialData / ytcfg) out of a page by brace-matching.
 * The blob is megabytes of nested JSON containing every kind of quote and
 * escape, so a lazy regex cannot be trusted to find its end.
 */
export function extractJsonAfter(html: string, marker: string): unknown | null {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const start = html.indexOf("{", at);
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Every value stored under `key`, anywhere in the tree. */
export function collect<T = unknown>(node: unknown, key: string, out: T[] = []): T[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, key, out));
    return out;
  }
  if (!node || typeof node !== "object") return out;
  const obj = node as Record<string, unknown>;
  if (key in obj) out.push(obj[key] as T);
  Object.values(obj).forEach((v) => collect(v, key, out));
  return out;
}

/**
 * "1.3M views" / "873K views" / "1,234 views" → a number. Also handles the
 * spelled-out form ("18 million views") that YouTube uses in the accessibility
 * text on the Shorts tab.
 */
export function parseViewCount(text: string | undefined): number | null {
  if (!text) return null;
  const clean = text.replace(/,/g, "");
  const word = /([\d.]+)\s+(thousand|million|billion)/i.exec(clean);
  if (word) {
    const mult = { thousand: 1e3, million: 1e6, billion: 1e9 }[
      word[2].toLowerCase() as "thousand" | "million" | "billion"
    ];
    return Math.round(parseFloat(word[1]) * mult);
  }
  const m = /([\d.]+)\s*([KMB])?/i.exec(clean);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase()] ?? 1;
  return Math.round(n * mult);
}

/** "4:52" / "1:02:11" → seconds. */
export function parseDuration(text: string | undefined): number | null {
  if (!text || !/^\d+(:\d{2})+$/.test(text)) return null;
  return text
    .split(":")
    .map(Number)
    .reduce((acc, part) => acc * 60 + part, 0);
}

/** "9 years ago" → an approximate ISO date, for sorting older popular videos. */
export function parseRelativeDate(text: string | undefined, now = Date.now()): string | null {
  if (!text) return null;
  const m = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const secs: Record<string, number> = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2629800,
    year: 31557600,
  };
  return new Date(now - n * secs[unit] * 1000).toISOString();
}

export interface ParsedVideo {
  videoId: string;
  title: string;
  durationSec: number | null;
  views: number | null;
  /** Human string straight from YouTube ("2 months ago"). */
  publishedText: string | null;
  /** ISO — exact from RSS, approximate when derived from publishedText. */
  published: string | null;
  publishedExact: boolean;
}

interface Lockup {
  contentId?: string;
  contentType?: string;
  contentImage?: {
    thumbnailViewModel?: {
      overlays?: {
        thumbnailBottomOverlayViewModel?: {
          badges?: { thumbnailBadgeViewModel?: { text?: string } }[];
        };
      }[];
    };
  };
  metadata?: {
    lockupMetadataViewModel?: {
      title?: { content?: string };
      metadata?: {
        contentMetadataViewModel?: {
          metadataRows?: { metadataParts?: { text?: { content?: string } }[] }[];
        };
      };
    };
  };
}

/** Video tiles out of any channel/browse payload. */
export function parseLockups(root: unknown, now = Date.now()): ParsedVideo[] {
  const lockups = collect<Lockup>(root, "lockupViewModel");
  const seen = new Set<string>();
  const out: ParsedVideo[] = [];

  for (const l of lockups) {
    if (l.contentType && l.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") continue;
    const videoId = l.contentId;
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || seen.has(videoId)) continue;
    seen.add(videoId);

    const md = l.metadata?.lockupMetadataViewModel;
    const parts =
      md?.metadata?.contentMetadataViewModel?.metadataRows?.flatMap(
        (r) => r.metadataParts?.map((p) => p.text?.content ?? "") ?? []
      ) ?? [];

    const viewsText = parts.find((p) => /view/i.test(p));
    const agoText = parts.find((p) => /ago$/i.test(p));

    let durationSec: number | null = null;
    for (const ov of l.contentImage?.thumbnailViewModel?.overlays ?? []) {
      for (const b of ov.thumbnailBottomOverlayViewModel?.badges ?? []) {
        const d = parseDuration(b.thumbnailBadgeViewModel?.text);
        if (d !== null) durationSec = d;
      }
    }

    out.push({
      videoId,
      title: (md?.title?.content ?? "").slice(0, 300),
      durationSec,
      views: parseViewCount(viewsText),
      publishedText: agoText ?? null,
      published: parseRelativeDate(agoText, now),
      publishedExact: false,
    });
  }
  return out;
}

/**
 * The Shorts tab is a different renderer with a different payload: no duration
 * badge and no publish date, but the title and view count are both inside the
 * accessibility label ("Paying For Food With My Car, 18 million views - play
 * Short"). Worth parsing — a channel's short-form output is invisible on the
 * Videos tab, so without this the Short filter would be nearly empty.
 */
export function parseShortsLockups(root: unknown): ParsedVideo[] {
  const items = collect<{
    entityId?: string;
    accessibilityText?: string;
    onTap?: { innertubeCommand?: { reelWatchEndpoint?: { videoId?: string } } };
  }>(root, "shortsLockupViewModel");

  const seen = new Set<string>();
  const out: ParsedVideo[] = [];
  for (const it of items) {
    const videoId =
      it.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ??
      /shorts-shelf-item-([A-Za-z0-9_-]{11})/.exec(it.entityId ?? "")?.[1];
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || seen.has(videoId)) continue;
    seen.add(videoId);

    const label = it.accessibilityText ?? "";
    const m = /^(.*),\s+([^,]*?)\s+views?\s+-\s+play Short$/i.exec(label);
    out.push({
      videoId,
      title: (m?.[1] ?? label.replace(/\s+-\s+play Short$/i, "")).slice(0, 300),
      durationSec: null,
      views: m ? parseViewCount(m[2]) : null,
      publishedText: null,
      published: null,
      publishedExact: false,
    });
  }
  return out;
}

/**
 * The channel's own sort tabs. "Popular" is what surfaces all-time winners;
 * it's a continuation token rather than a URL, so it has to be replayed
 * through innertube.
 */
export function findSortToken(root: unknown, label: string): string | null {
  const chips = collect<{
    text?: string;
    tapCommand?: { innertubeCommand?: { continuationCommand?: { token?: string } } };
  }>(root, "chipViewModel");
  const chip = chips.find((c) => c.text?.toLowerCase() === label.toLowerCase());
  return chip?.tapCommand?.innertubeCommand?.continuationCommand?.token ?? null;
}

/** Replay a continuation token against the internal browse endpoint. */
export async function browseContinuation(
  token: string,
  apiKey: string,
  clientVersion: string
): Promise<unknown | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/browse?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "content-type": "application/json", "user-agent": YT_UA },
        body: JSON.stringify({
          context: { client: { clientName: "WEB", clientVersion } },
          continuation: token,
        }),
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * The upload feed: only 15 videos, but the view counts and publish dates are
 * exact, where the page-scraped ones are rounded ("15K views").
 */
export function parseRssFeed(xml: string): {
  channelId: string | null;
  channelName: string | null;
  videos: ParsedVideo[];
} {
  const channelId = /<yt:channelId>([^<]+)<\/yt:channelId>/.exec(xml)?.[1] ?? null;
  const channelName = /<author>\s*<name>([^<]*)<\/name>/.exec(xml)?.[1] ?? null;

  const videos: ParsedVideo[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const videoId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(e)?.[1];
    if (!videoId) continue;
    const published = /<published>([^<]+)<\/published>/.exec(e)?.[1] ?? null;
    videos.push({
      videoId,
      title: (/<title>([^<]*)<\/title>/.exec(e)?.[1] ?? "").slice(0, 300),
      durationSec: null,
      views: parseViewCount(
        /<media:statistics\s+views="(\d+)"/.exec(e)?.[1] ?? undefined
      ),
      publishedText: null,
      published,
      publishedExact: Boolean(published),
    });
  }
  return { channelId, channelName, videos };
}

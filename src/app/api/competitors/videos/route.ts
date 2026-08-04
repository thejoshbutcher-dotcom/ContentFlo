import { NextResponse } from "next/server";
import {
  browseContinuation,
  channelVideosUrl,
  extractJsonAfter,
  fetchText,
  findSortToken,
  parseChannelInput,
  parseLockups,
  parseRssFeed,
  parseShortsLockups,
  type ParsedVideo,
} from "@/lib/youtube";

/**
 * A channel's video wall: its recent uploads merged with its all-time most
 * watched, which is the pairing that makes the view useful — what they're
 * doing now, next to what actually worked.
 *
 * Three sources, each covering the others' gaps:
 *   - the /videos page: recent uploads WITH durations, rounded view counts
 *   - the "Popular" sort (a continuation token, replayed via innertube):
 *     all-time top, also with durations
 *   - the RSS feed: only 15 videos, but EXACT view counts and publish dates
 */

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const input = (body as { input?: unknown })?.input;
  if (typeof input !== "string" || !input.trim()) {
    return NextResponse.json({ error: "No channel provided" }, { status: 400 });
  }
  const target = parseChannelInput(input);
  if (!target) {
    return NextResponse.json({ error: "Not a YouTube channel" }, { status: 400 });
  }

  const html = await fetchText(channelVideosUrl(target));
  if (!html) {
    return NextResponse.json(
      { error: "Couldn't reach that channel — try again in a moment." },
      { status: 502 }
    );
  }

  const channelId =
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ??
    /<meta itemprop="identifier" content="(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ??
    null;
  if (!channelId) {
    return NextResponse.json({ error: "That channel doesn't exist." }, { status: 404 });
  }

  const now = Date.now();
  const data = extractJsonAfter(html, "ytInitialData");
  const recent = data ? parseLockups(data, now) : [];

  // All-time top. Best-effort: if YouTube renames the sort chips again we
  // still return the recent uploads rather than failing the whole request.
  let popular: ParsedVideo[] = [];
  const token = data ? findSortToken(data, "Popular") : null;
  const apiKey = /"INNERTUBE_API_KEY":"([^"]+)"/.exec(html)?.[1];
  const clientVersion = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html)?.[1];
  if (token && apiKey && clientVersion) {
    const res = await browseContinuation(token, apiKey, clientVersion);
    if (res) popular = parseLockups(res, now);
  }

  // The Shorts tab, in parallel with the feed. Shorts live on their own tab, so
  // without this a channel's short-form output never appears on the wall.
  const [rssXml, shortsHtml] = await Promise.all([
    fetchText(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
    ),
    fetchText(`https://www.youtube.com/channel/${channelId}/shorts`),
  ]);
  const rss = rssXml ? parseRssFeed(rssXml) : null;
  const shortsData = shortsHtml ? extractJsonAfter(shortsHtml, "ytInitialData") : null;
  const shorts = shortsData ? parseShortsLockups(shortsData) : [];

  // Merge: page data first (it carries durations), then let RSS overwrite the
  // rounded view counts and relative dates with exact ones.
  const byId = new Map<
    string,
    ParsedVideo & { inRecent: boolean; inTop: boolean; isShort: boolean }
  >();
  const add = (v: ParsedVideo, where: "recent" | "top" | "short") => {
    const prev = byId.get(v.videoId);
    if (!prev) {
      byId.set(v.videoId, {
        ...v,
        inRecent: where === "recent",
        inTop: where === "top",
        isShort: where === "short",
      });
      return;
    }
    prev.inRecent ||= where === "recent";
    prev.inTop ||= where === "top";
    prev.isShort ||= where === "short";
    prev.durationSec ??= v.durationSec;
    prev.views ??= v.views;
    if (!prev.title) prev.title = v.title;
  };
  recent.forEach((v) => add(v, "recent"));
  popular.forEach((v) => add(v, "top"));
  shorts.forEach((v) => add(v, "short"));

  for (const v of rss?.videos ?? []) {
    const prev = byId.get(v.videoId);
    if (prev) {
      if (v.views !== null) prev.views = v.views; // exact beats rounded
      if (v.published) {
        prev.published = v.published;
        prev.publishedExact = true;
      }
      if (!prev.title) prev.title = v.title;
      prev.inRecent = true;
    } else {
      byId.set(v.videoId, { ...v, inRecent: true, inTop: false, isShort: false });
    }
  }

  const videos = [...byId.values()];
  if (!videos.length) {
    return NextResponse.json(
      {
        error:
          "No videos found for that channel. If it has uploads, YouTube may have changed its page format — let us know.",
      },
      { status: 404 }
    );
  }

  /**
   * Outlier baseline = the median of RECENT uploads: what this channel does on
   * a normal day right now. Measuring against the all-time set would drown the
   * signal, since those videos are the top by definition.
   *
   * Shorts get their own baseline. They routinely out-view long form by an
   * order of magnitude, so scoring them against a long-form median would label
   * every Short a runaway hit and say nothing about whether it beat the
   * channel's other Shorts.
   */
  // Which baseline a video belongs to follows its FORMAT (did it come off the
  // Shorts tab), not its runtime. A brisk six-minute tutorial and a 2:44 one
  // are the same kind of thing; a Short is not. The UI's Short filter still
  // goes by duration, as specified — these are different questions.
  const medianOf = (nums: number[]) => {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const viewsOf = (list: typeof videos) =>
    list.filter((v) => typeof v.views === "number").map((v) => v.views as number);

  const shortsPool = videos.filter((v) => v.isShort);
  const longs = videos.filter((v) => !v.isShort);
  const longMedian =
    medianOf(viewsOf(longs.filter((v) => v.inRecent))) || medianOf(viewsOf(longs));
  // A couple of Shorts make too small a sample to be anyone's "normal"; below
  // that, score everything against the channel's main output instead.
  const shortMedian = shortsPool.length >= 5 ? medianOf(viewsOf(shortsPool)) : 0;

  const out = videos.map((v) => {
    const base = v.isShort && shortMedian > 0 ? shortMedian : longMedian;
    return {
      ...v,
      multiple: base > 0 && v.views ? Number((v.views / base).toFixed(1)) : null,
    };
  });

  return NextResponse.json({
    channelId,
    channelName: rss?.channelName ?? null,
    fetchedAt: new Date().toISOString(),
    medianViews: Math.round(longMedian),
    shortMedianViews: Math.round(shortMedian),
    counts: {
      recent: recent.length,
      top: popular.length,
      shorts: shorts.length,
      total: out.length,
    },
    videos: out,
  });
}

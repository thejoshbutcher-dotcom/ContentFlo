import { NextResponse } from "next/server";
import { parseYouTubeId } from "@/lib/inspo";

/**
 * Turns pasted YouTube links into library items (title + channel).
 *
 * Runs server-side because YouTube's oEmbed endpoint isn't reliably readable
 * from the browser. Deliberately YouTube-only: the id is parsed and validated
 * first and the request URL is then rebuilt from that id, so this can never be
 * pointed at an arbitrary host.
 */

const MAX_URLS = 40;

interface Resolved {
  input: string;
  videoId?: string;
  title?: string;
  channel?: string;
  error?: string;
}

type Meta = { title: string; channel: string };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function clean(m: Partial<Meta> | null): Meta | null {
  const title = (m?.title ?? "").trim().slice(0, 300);
  const channel = (m?.channel ?? "").trim().slice(0, 120);
  return title ? { title, channel } : null;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(7000),
    headers: { accept: "application/json", "user-agent": UA },
  });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return (await res.json()) as Record<string, unknown>;
}

/** YouTube's own oEmbed — one retry, since a busy server gets the odd 429/5xx. */
async function viaOembed(watch: string): Promise<Meta | null> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const d = await getJson(url);
      return clean({ title: String(d?.title ?? ""), channel: String(d?.author_name ?? "") });
    } catch (e) {
      const status = (e as { status?: number }).status;
      // 401/403/404: embedding off, private or gone — retrying won't help.
      if (status && status < 429 && status !== 408) return null;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
    }
  }
  return null;
}

/** noembed.com relays the same oEmbed data from other IPs. */
async function viaNoembed(watch: string): Promise<Meta | null> {
  try {
    const d = await getJson(`https://noembed.com/embed?url=${encodeURIComponent(watch)}`);
    if (d?.error) return null;
    return clean({ title: String(d?.title ?? ""), channel: String(d?.author_name ?? "") });
  } catch {
    return null;
  }
}

const decodeEntities = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");

/** Last resort: the watch page itself (also works when embedding is disabled). */
async function viaWatchPage(watch: string): Promise<Meta | null> {
  try {
    const res = await fetch(`${watch}&hl=en`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent": UA,
        "accept-language": "en-US,en;q=0.9",
        // Skip the EU cookie-consent interstitial.
        cookie: "CONSENT=YES+cb; SOCS=CAI",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const title =
      /<meta name="title" content="([^"]*)"/.exec(html)?.[1] ??
      /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ??
      "";
    const channel =
      /<link itemprop="name" content="([^"]*)"/.exec(html)?.[1] ??
      /"ownerChannelName":"([^"]*)"/.exec(html)?.[1] ??
      "";
    return clean({ title: decodeEntities(title), channel: decodeEntities(channel) });
  } catch {
    return null;
  }
}

async function resolveOne(input: string): Promise<Resolved> {
  const videoId = parseYouTubeId(input);
  if (!videoId) return { input, error: "Not a YouTube link" };

  // Every request below is built from the validated id — never from the
  // user-supplied host/path.
  const watch = `https://www.youtube.com/watch?v=${videoId}`;

  // YouTube sometimes refuses or throttles requests from hosting providers'
  // servers; that used to save the video as "Untitled" with no channel. Fall
  // through to the next source instead.
  const meta =
    (await viaOembed(watch)) ?? (await viaNoembed(watch)) ?? (await viaWatchPage(watch));
  if (!meta) {
    console.warn(`[inspo/resolve] no title for ${videoId}`);
    // Private, deleted or region-locked: still worth saving — the thumbnail
    // usually resolves and the user can type their own title.
    return { input, videoId, title: "", channel: "" };
  }
  return { input, videoId, ...meta };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const urls = (body as { urls?: unknown })?.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: "No links provided" }, { status: 400 });
  }

  const list = urls
    .filter((u): u is string => typeof u === "string")
    .slice(0, MAX_URLS);

  const items = await Promise.all(list.map(resolveOne));
  return NextResponse.json({ items });
}

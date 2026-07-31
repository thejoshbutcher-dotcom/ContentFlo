import { NextResponse } from "next/server";
import { parseCollectionUrl } from "@/lib/inspo";

/**
 * Reads a YouTube playlist (or a channel's uploads) and returns the videos in
 * it, so a whole swipe-file playlist can be imported in one paste.
 *
 * YouTube stopped shipping this list as markup — it lives in the `ytInitialData`
 * blob as `lockupViewModel` entries, which is what this parses. No API key
 * needed. Only public and unlisted playlists are readable: a private one (and
 * Watch Later, which is always private) has nothing to read without the
 * owner's session.
 *
 * Like the resolve route, the target URL is rebuilt from a validated id, so
 * this can never be pointed at another host.
 */

const MAX_ITEMS = 200;

interface Lockup {
  contentId?: string;
  contentType?: string;
  metadata?: {
    lockupMetadataViewModel?: {
      title?: { content?: string };
      metadata?: {
        contentMetadataViewModel?: {
          metadataRows?: {
            metadataParts?: { text?: { content?: string } }[];
          }[];
        };
      };
    };
  };
}

/** Pull the ytInitialData object out of the page by brace-matching — the blob
 *  is megabytes of nested JSON, so a lazy regex can't be trusted to end it. */
function extractInitialData(html: string): unknown | null {
  const marker = html.indexOf("ytInitialData");
  if (marker === -1) return null;
  const start = html.indexOf("{", marker);
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

function collectLockups(node: unknown, out: Lockup[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectLockups(n, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.lockupViewModel) out.push(obj.lockupViewModel as Lockup);
  Object.values(obj).forEach((v) => collectLockups(v, out));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = (body as { url?: unknown })?.url;
  if (typeof url !== "string") {
    return NextResponse.json({ error: "No link provided" }, { status: 400 });
  }

  const target = parseCollectionUrl(url);
  if (!target) {
    return NextResponse.json(
      { error: "That isn't a playlist or channel link" },
      { status: 400 }
    );
  }

  if (target.kind === "playlist" && /^(WL|LL|HL)$/i.test(target.id)) {
    return NextResponse.json(
      {
        error:
          "Watch Later and Liked videos are private to your YouTube account, so they can't be read. Save the videos to a normal playlist (set it to Unlisted) and paste that instead.",
      },
      { status: 400 }
    );
  }

  const fetchUrl =
    target.kind === "playlist"
      ? `https://www.youtube.com/playlist?list=${encodeURIComponent(target.id)}`
      : `https://www.youtube.com/${target.id}/videos`;

  let html: string;
  try {
    const res = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        // Without a browser UA YouTube serves a stripped page with no data blob.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `YouTube returned ${res.status}` },
        { status: 502 }
      );
    }
    html = await res.text();
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach YouTube — try again in a moment" },
      { status: 502 }
    );
  }

  const data = extractInitialData(html);
  if (!data) {
    return NextResponse.json(
      { error: "Couldn't read that page" },
      { status: 502 }
    );
  }

  const lockups: Lockup[] = [];
  collectLockups(data, lockups);

  const name = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.replace(/ - YouTube$/, "");

  const seen = new Set<string>();
  const items: { videoId: string; title: string; channel?: string }[] = [];
  for (const l of lockups) {
    if (l.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") continue;
    const id = l.contentId;
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const md = l.metadata?.lockupMetadataViewModel;
    // On a playlist the first metadata row is the uploader; on a channel page
    // it's the view count, and every video belongs to the channel anyway.
    const row =
      md?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]
        ?.text?.content;
    const channel = target.kind === "channel" ? name : row;
    items.push({
      videoId: id,
      title: (md?.title?.content ?? "").slice(0, 300),
      channel: channel?.slice(0, 120),
    });
    if (items.length >= MAX_ITEMS) break;
  }

  if (!items.length) {
    return NextResponse.json(
      {
        error:
          "No videos found. If the playlist is Private, set it to Unlisted so CreatorFlo can read it.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ name: name ?? "", items });
}

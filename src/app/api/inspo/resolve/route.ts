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

async function resolveOne(input: string): Promise<Resolved> {
  const videoId = parseYouTubeId(input);
  if (!videoId) return { input, error: "Not a YouTube link" };

  // Built from the validated id — never from user-supplied host/path.
  const target = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;

  try {
    const res = await fetch(target, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      // Private, deleted, or region-locked: still worth saving — the thumbnail
      // usually resolves and the user can type their own title.
      return { input, videoId, title: "", channel: "" };
    }
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
    };
    return {
      input,
      videoId,
      title: (data.title ?? "").slice(0, 300),
      channel: (data.author_name ?? "").slice(0, 120),
    };
  } catch {
    return { input, videoId, title: "", channel: "" };
  }
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

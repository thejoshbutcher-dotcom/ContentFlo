import { NextResponse } from "next/server";
import {
  channelVideosUrl,
  extractJsonAfter,
  fetchText,
  parseChannelInput,
} from "@/lib/youtube";

/**
 * Turns a pasted channel (@handle, URL, or id) into the identity we store:
 * the stable channel id plus display info. The id matters — handles can be
 * changed by their owner, ids can't.
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
    return NextResponse.json(
      { error: "That doesn't look like a YouTube channel. Try an @handle or channel URL." },
      { status: 400 }
    );
  }

  const html = await fetchText(channelVideosUrl(target));
  if (!html) {
    return NextResponse.json(
      { error: "Couldn't reach that channel — check the handle and try again." },
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

  const fallbackName = target.kind === "handle" ? target.handle : channelId;
  const name =
    /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ||
    /<meta itemprop="name" content="([^"]*)"/.exec(html)?.[1] ||
    fallbackName;

  const handle =
    /"canonicalBaseUrl":"\/(@[A-Za-z0-9._-]{1,60})"/.exec(html)?.[1] ??
    (target.kind === "handle" ? target.handle : null);

  const subscribersText = /([\d.,]+[KMB]?\s+subscribers)/.exec(html)?.[1] ?? null;
  const videoCountText = /([\d.,]+\s+videos)"/.exec(html)?.[1] ?? null;

  // Confirms the parser still works before the channel is saved, so a broken
  // scrape surfaces at add-time instead of as a mysteriously empty wall.
  const hasVideoData = Boolean(extractJsonAfter(html, "ytInitialData"));

  return NextResponse.json({
    channelId,
    name: name.slice(0, 120),
    handle,
    subscribersText,
    videoCountText,
    hasVideoData,
  });
}

import { NextResponse } from "next/server";

/**
 * Metadata for a bookmark card: page title, site name, preview image.
 *
 * Unlike the YouTube routes (which rebuild URLs from validated ids), this one
 * fetches a user-supplied URL, so it guards against being used as a proxy into
 * private networks: http(s) only, no localhost or private-range IP literals,
 * tight timeout, and only the first chunk of the response is read. It returns
 * extracted text, never the fetched body.
 */

const MAX_BYTES = 300_000;

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv4 literal?
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  // IPv6 loopback / unique-local / link-local literals
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
    return true;
  }
  return false;
}

function pick(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return decodeEntities(m[1].trim()).slice(0, 300) || null;
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

const meta = (name: string) => [
  new RegExp(`<meta[^>]+property=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
  new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${name}["']`, "i"),
  new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
];

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const raw = (body as { url?: unknown })?.url;
  if (typeof raw !== "string") {
    return NextResponse.json({ error: "No url" }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Not a valid URL" }, { status: 400 });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) links" }, { status: 400 });
  }
  if (isPrivateHost(url.hostname)) {
    return NextResponse.json({ error: "That host isn't reachable" }, { status: 400 });
  }

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok || !res.body) {
      return NextResponse.json({ title: null, site: null, image: null });
    }

    // Read only the head-ish portion — metadata lives up top, and this caps
    // what a hostile or huge page can make us buffer.
    const reader = res.body.getReader();
    let html = "";
    while (html.length < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    void reader.cancel().catch(() => {});

    const title =
      pick(html, meta("og:title")) ??
      pick(html, meta("twitter:title")) ??
      pick(html, [/<title[^>]*>([^<]+)<\/title>/i]);
    const site = pick(html, meta("og:site_name"));
    let image = pick(html, meta("og:image")) ?? pick(html, meta("twitter:image"));
    if (image) {
      try {
        image = new URL(image, res.url || url).toString();
        if (!/^https?:$/.test(new URL(image).protocol)) image = null;
      } catch {
        image = null;
      }
    }

    return NextResponse.json({ title, site, image });
  } catch {
    return NextResponse.json({ title: null, site: null, image: null });
  }
}

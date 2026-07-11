/*
 * CreatorFlo service worker.
 *
 * Deliberately conservative. It exists mainly to make the app installable and
 * to give a graceful offline screen — NOT to aggressively cache. It never
 * touches anything that must always be fresh or server-verified:
 *   - /api/* and /auth/* (checkout, webhook, sign-in, the access gate)
 *   - cross-origin requests (Supabase, Stripe) — left entirely to the browser
 *   - navigations are network-FIRST, so the gated HTML is never served stale
 *
 * Only immutable, content-hashed static assets are cached (cache-first).
 * Bump CACHE_VERSION to force clients onto a new cache.
 */
const CACHE_VERSION = "v1";
const STATIC_CACHE = `creatorflo-static-${CACHE_VERSION}`;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CreatorFlo — Offline</title>
<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;
justify-content:center;background:#181A20;color:#fff;font-family:system-ui,
-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px}
.wrap{max-width:22rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#8A9099;
line-height:1.5;margin:0 0 1.25rem}button{background:#F7C948;color:#181A20;
border:0;border-radius:12px;padding:.7rem 1.25rem;font-weight:600;font-size:1rem;
cursor:pointer}</style></head><body><div class="wrap">
<h1>You're offline</h1><p>CreatorFlo can't reach the network right now. Check your
connection and try again.</p><button onclick="location.reload()">Retry</button>
</div></body></html>`;

self.addEventListener("install", (event) => {
  // Take over as soon as possible; nothing to precache.
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("creatorflo-static-") && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isImmutableStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/apple-touch-icon.png"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only ever handle our own origin. Supabase/Stripe/etc. are untouched.
  if (url.origin !== self.location.origin) return;

  // Never intercept API or auth routes — they must hit the server every time.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Immutable, content-hashed assets: cache-first.
  if (isImmutableStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // Navigations: network-first (keeps the auth-gated HTML fresh), offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html" } })
      )
    );
    return;
  }

  // Everything else same-origin: just go to network.
});

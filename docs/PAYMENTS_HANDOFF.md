# CreatorFlo — Payments & Launch Handoff

Hand this to a new chat to take payments from **Stripe test mode** to **real, live payments**. The whole auth + purchase system is already built and verified in test mode; what remains is deployment, going live on Stripe, and a security checklist. **Do not rebuild the auth or payment code — it works.**

---

## Current status (as of this handoff)

- App: **CreatorFlo**, a Next.js 16 / React 19 content planner. Repo: `git@github.com:thejoshbutcher-dotcom/ContentFlo.git`, branch `main`.
- **Deployed on Hostinger at https://creatorflo.io**, auto-building from the GitHub repo (Node.js runtime, LiteSpeed in front). Also runs locally (`npm run dev`, port 3000 — pinned, do not change).
- Auth + purchase gating is **built and verified in Stripe test mode**. Locally the login wall is ON. **In production it is currently OFF because the Supabase/Stripe env vars are not yet set on Hostinger** — see "Live site (Hostinger)" below. Secrets are gitignored and never committed, so the host needs them set separately.
- Backend: Supabase project ref `rnwvgdwhbyjylcgexzzd` (Auth + Postgres + Storage + RLS). Migrations in `supabase/migrations/` (0001–0003) are already applied.
- Payments: Stripe **test mode**. A one-time $29 test price exists. Local webhooks were tested via the Stripe CLI (`stripe listen`).

## What already works (verified end-to-end)

- **Magic-link sign-in** (`/login`, `/auth/confirm`) using the default PKCE flow — no custom SMTP required.
- **Purchase-first flow**: buy → Stripe Checkout → webhook writes a `purchases` row keyed by **email** → sign in with that email → account created and linked. Entitlement is by email because the buyer has no account when they pay.
- **Server-side gate** in `src/app/page.tsx`: signed-out → `/login`; signed-in without a purchase → `/purchase`; signed-in with a purchase → the app. No client can bypass it.
- **Stripe webhook** (`/api/stripe/webhook`): verifies the raw-body signature and is idempotent via the `stripe_events` table (Stripe retries can't double-apply).
- **Cloud sync**: cards and profiles sync to Supabase per-device; one-time "Import your local data?" prompt on first sign-in; localStorage kept as a backup.
- **Admin comp access**: `ADMIN_EMAILS` grants access with no purchase.
- **Dev instant-login**: `/api/dev-login` + a button on `/login`, triple-locked (404 in production builds, `DEV_LOGIN_EMAILS` allowlist, service-role key). For testing only.

## Key files (don't rewrite these; only configure/deploy)

| File | Role |
|---|---|
| `supabase/migrations/0001_init.sql` … `0003_purchases.sql` | schema, RLS, grants, storage bucket, `purchases` table |
| `src/app/page.tsx` | the real access gate (server component) |
| `src/app/api/checkout/route.ts` | creates the Stripe Checkout session |
| `src/app/api/stripe/webhook/route.ts` | records purchases; signature-verified + idempotent |
| `src/app/api/auth/check-access/route.ts` | UX-only pre-check on the login form |
| `src/lib/entitlement.ts` | `hasPurchase()` / `ADMIN_EMAILS` |
| `src/lib/stripe.ts`, `src/lib/supabase/*` | server clients |
| `src/proxy.ts` | session refresh + auth redirect (Next 16 renamed `middleware`→`proxy`) |
| `.env.example` | the full list of env vars |

---

## Live site (Hostinger) — make the deployed app actually gate

The app is already deployed at **https://creatorflo.io** and auto-builds from GitHub, so **code changes go live on push**. But env vars are NOT in the repo (secrets are gitignored), so the live site has none — which is why the login wall and cloud sync don't appear there yet. Confirm anytime by opening `https://creatorflo.io/auth/status`; `"supabaseConfigured": false` means the keys aren't set.

To switch the live site on:

1. **Hostinger control panel → your app → Environment Variables.** Add the keys from step 4 below, using `NEXT_PUBLIC_SITE_URL=https://creatorflo.io`. The five minimum for the login wall are the two `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, and `ADMIN_EMAILS`.
   - **Server-only secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) must NOT carry a `NEXT_PUBLIC_` prefix or they leak into the browser.
   - **Do not set** `DEV_LOGIN_EMAILS` / `NEXT_PUBLIC_DEV_LOGIN_EMAIL` in production. The dev-login route hard-404s when `NODE_ENV=production`, but leave them unset as defense in depth. On the live site you sign in with the real emailed magic link, not the dev button.
2. **Supabase → Authentication → URL Configuration.** Set **Site URL** = `https://creatorflo.io` and add `https://creatorflo.io/**` to **Redirect URLs** (keep `http://localhost:3000/**` too for local dev). Without this the magic link dead-ends on the live site.
3. **Trigger a rebuild / redeploy** so the new env vars are baked in (`NEXT_PUBLIC_*` values are inlined at build time, so an env change needs a fresh build, not just a restart).
4. Re-check `https://creatorflo.io/auth/status` → should read `"supabaseConfigured": true, "loginWallEnabled": true`. The wall is now live.

Keep the app running as a **Node.js app** on Hostinger — it uses server components, API routes, and the auth proxy. Static hosting would break all of that. (`/auth/status` returning live JSON confirms Node is running.)

Everything below is only for turning on **real (live-mode) payments**; the login wall itself works with just the Supabase vars above, in Stripe test mode.

---

## To go live with real payments

### 0. Deploy the app (already done)
Live at **https://creatorflo.io** on Hostinger. Real Stripe webhooks need this public HTTPS URL — Stripe can't reach `localhost`.

### 1. Stripe: switch to live mode
- Toggle **off** Test mode in the Stripe dashboard.
- Recreate the product + **one-time price** in live mode (test objects don't carry over). Copy the live `price_…`.
- Get the live **secret key** (`sk_live_…`).

### 2. Stripe: create a permanent webhook endpoint
- Dashboard → Developers → Webhooks → **Add endpoint** → URL: `https://creatorflo.io/api/stripe/webhook`.
- Subscribe to events: `checkout.session.completed` and `charge.refunded`.
- Copy the endpoint's **signing secret** (`whsec_…`). This is different from the CLI one used locally.

### 3. Supabase: point auth at the production domain
- Authentication → URL Configuration → **Site URL** = `https://creatorflo.io`, and add `https://creatorflo.io/**` to **Redirect URLs**.
- (Optional but recommended before real users: set up **custom SMTP**, e.g. Resend/Postmark. Supabase's built-in mailer is rate-limited to a few emails/hour and will throttle real sign-ins. Custom SMTP also unlocks editing the email templates.)

### 4. Set production env vars (on the host, NOT in the repo)
```
NEXT_PUBLIC_SUPABASE_URL=https://rnwvgdwhbyjylcgexzzd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
SUPABASE_SERVICE_ROLE_KEY=<ROTATED key — see checklist>
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...        # the live endpoint's secret from step 2
NEXT_PUBLIC_STRIPE_PRICE_ID=price_...  # the live price from step 1
NEXT_PUBLIC_SITE_URL=https://creatorflo.io
NEXT_PUBLIC_ENABLE_AUTH=true           # login wall (ON by default when Supabase is configured; this is explicit)
ADMIN_EMAILS=thejoshbutcher@gmail.com  # only emails you intend to comp
DEV_LOGIN_EMAILS=                      # MUST be empty in production
NEXT_PUBLIC_DEV_LOGIN_EMAIL=           # MUST be empty in production
```

### 5. Test one real purchase
Use a real card (or Stripe's live-mode test tooling) end to end: buy → land on `/login?purchased=1` → sign in with that email → confirm you reach the app and a row appears in `purchases`.

---

## 🔒 Pre-launch security checklist (do not skip)

1. **Rotate the Supabase `service_role` key.** It was shared in a dev chat and must be considered exposed. Supabase → Project Settings → API Keys → roll it, then update `SUPABASE_SERVICE_ROLE_KEY` everywhere. (There's a persistent memory note about this.)
2. **Login wall on.** It's now ON by default whenever Supabase is configured (fail-secure); only `NEXT_PUBLIC_ENABLE_AUTH=false` disables it. Ensure production does **not** set it to `false`.
3. **`DEV_LOGIN_EMAILS` empty** in production. The route also hard-404s when `NODE_ENV=production`, but leave it empty as defense in depth.
4. **`ADMIN_EMAILS`** contains only emails you truly want to give free access.
5. Confirm `.env.local` / real keys are **never committed** (they're gitignored; verify in CI).
6. Verify RLS: as a second user, `select * from cards` must return 0 rows.

---

## Verified test data currently in Supabase
- One real auth user: `thejoshbutcher@gmail.com` (also in `ADMIN_EMAILS`).
- One `purchases` row for that email (seeded during testing). Harmless; the admin bypass covers access regardless.

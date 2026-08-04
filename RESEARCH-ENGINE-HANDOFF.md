# Research Engine — Handoff from the JBO Content-Plan Session

> ## ⚠️ SCOPE DECISION (Josh, Aug 4 2026): BUILD PHASE 1 ONLY
> Build just the **Competitor Research section**: a place in CreatorFlo where a user pastes
> 2–5 of their favorite competitor channels and gets browsable video walls — thumbnails,
> view counts, durations, most-viewed / newest sorting, and **outlier highlighting** (videos
> whose views far exceed the channel's typical performance). **No AI API integration needed
> for this scope.** CreatorFlo's existing Brainstorm/bucket system already covers ideation;
> the AI deep-dive (Phase 2) and refresh engine (Phase 3) described below are future roadmap
> — read them for context, don't build them yet. Implementation notes for Phase 1: "Layer A"
> throughout this doc, plus the Phase 1 paragraph in the Phasing section.

*Written Aug 4, 2026, from the session where we built Josh's "Idea Vault" — a research-backed
idea dashboard now live at https://slategray-swallow-874310.hostingersite.com. This doc specs
how to productize that process as a CreatorFlo feature.*

---

## What we did manually (the process to productize)

1. **Niche deep dive** — AI agents with web search researched Josh's niche: who the competitors
   are, their subscriber counts, business models, what's proven vs. unproven, market gaps.
2. **Idea generation with receipts** — ~190 content ideas, each tagged with format, funnel
   stage, content bucket, and (for 46 of them) a **proof link**: a real YouTube video with
   verified view count + outlier context ("855K views on a 12.8K-sub channel") proving demand.
3. **Competitor wall** — for 14 channels, pulled each channel's recent uploads + all-time top
   ~30 videos (thumbnails, views, durations) into a browsable, sortable grid. No YouTube API
   key — RSS feeds + channel-page scraping.
4. **The dashboard** — channel → audience bucket → mood filters; "proven only" toggle; click a
   competitor → their video wall sorted by views; paste any channel URL → auto-added.

The user experience to replicate: *"I open the app, pick a mood/bucket, and every idea I see
is backed by a real video that already worked. When I want inspiration, competitors' best
videos are one click away."*

---

## Answers to the three key questions

### 1. What does the user provide? (onboarding)

A one-time "Deep Dive" wizard, ~5 inputs:
- **Niche description** (free text: "I teach watercolor to beginners")
- **Their channel URL** (optional — lets the AI infer voice/topics from their own uploads)
- **2–5 competitor channels they admire** (paste URLs; the system can suggest more)
- **What they sell / their offer** (optional — so ideas can map to a funnel like Josh's did)
- Their existing CreatorFlo **content buckets** (already in the DB — reuse, don't re-ask)

### 2. Do you need an AI API? — Yes, but only for half of it

Split the pipeline in two. This split is the whole cost model:

**Layer A — YouTube data (NO AI, deterministic, nearly free):**
- Channel resolution, recent uploads, view counts, thumbnails, durations, all-time top videos.
- Two implementation options:
  a. **Scrape path (what we used):** RSS feed per channel (`youtube.com/feeds/videos.xml?channel_id=`)
     gives latest 15 w/ view counts; the channel /videos page + innertube "Popular" continuation
     gives all-time top ~30. No key, no quota. Fragile if YouTube changes markup (it did once
     mid-session — parser needed a `lockupViewModel` update). Fine for launch.
  b. **YouTube Data API v3 (recommended at scale):** official, stable, free tier = 10,000
     units/day (a channel refresh ≈ ~5 units; search ≈ 100 units). Per-user OAuth or a server
     key. Migrate here when user count makes scraping risky.
- CreatorFlo precedent: `src/app/api/inspo/resolve/route.ts` already does server-side YouTube
  fetching with the same security posture (parse/validate ID, rebuild URL server-side). The
  new routes are siblings of that pattern.

**Layer B — AI research + idea synthesis (Claude API):**
- Niche landscape research (uses Claude's **server-side web search tool** — no scraping
  infrastructure needed on your side; declare `{"type": "web_search_20260209", "name": "web_search"}`
  in `tools` and Claude searches + reads the web itself, with citations).
- Idea generation: given niche + competitor data (from Layer A) + the user's buckets, generate
  ideas with hooks, formats, bucket assignments, and matched proof videos.
- Use **structured outputs** (`client.messages.parse()` with a Zod/JSON schema) so ideas come
  back as validated JSON that inserts straight into Supabase — no parsing failures.
- Model: `claude-opus-5` ($5/M input, $25/M output). TypeScript SDK: `@anthropic-ai/sdk` —
  fits the Next.js stack directly (server routes or a background worker).

### 3. What would it cost per user?

Our manual session: 5 research passes ≈ **~480K tokens total** (thorough, exploratory). A
productized pipeline is leaner because Layer A feeds structured data in (no token-expensive
web reading for competitor stats):
- **Deep dive (one-time per user):** ~3–6 Claude calls with web search — rough order
  **$1–4 per user** at Opus 5 rates depending on depth (plus web-search per-search fees —
  check current pricing at platform.claude.com/docs/en/pricing). Gate it: one included per
  account, re-runs paid or Pro-tier.
- **Idea refresh (weekly/monthly):** mostly Layer A (free) + one small synthesis call —
  **pennies**. The "outlier detector" (flag competitor videos with views ≫ channel average)
  is pure arithmetic on Layer A data, zero AI cost, and is the feature that makes the app
  feel alive ("3 new proven ideas this week").
- Sonnet 5 ($3/$15, intro $2/$10 through Aug 2026) is a fine downgrade lever for the synthesis
  calls if margins demand it; keep Opus for the one-time deep dive.

---

## Suggested architecture (CreatorFlo-native)

```
Onboarding wizard (client)
   └─> POST /api/research/deep-dive        ← creates a research_run row, kicks off job
         ├─ Layer A: fetch competitor data  (lib/youtube.ts — RSS + popular scrape or Data API)
         ├─ Layer B: Claude web-search research (niche, gaps, proven formats)
         ├─ Layer B: Claude idea synthesis  (structured outputs → ideas w/ proof links)
         └─ writes: competitors, competitor_videos, ideas → Supabase (per-account)
   └─> GET /api/research/status/:runId     ← client polls / streams progress
Weekly cron (Vercel cron or Supabase pg_cron)
   └─> refresh competitor_videos, run outlier detector, insert suggested ideas
```

**New Supabase tables:** `research_runs` (status, inputs, cost), `competitors` (per account:
name, channel_id, subs, notes), `competitor_videos` (video_id, title, views, duration,
published, is_outlier), `ideas` gets new columns: `proof_video_id`, `proof_views`,
`proof_context`, `source` ('deep_dive' | 'refresh' | 'manual').

**Long-running job caveat:** the deep dive takes minutes. Next.js API routes on Vercel have
timeout limits — run it as chunked steps the client advances through, a queued background
function, or stream progress via the research_run row. Don't try it in one request.

**UI:** the Brainstorm tab keeps its combination engine but gains a "Proven ideas" source fed
by this pipeline, plus a Competitors panel = the vault's competitor wall (the deployed vault
at the URL above is the working UI prototype — thumbnails grid, Most viewed/Newest sort,
type filters, paste-to-add).

---

## Phasing (recommended build order)

1. **Phase 1 — Competitor wall (no AI).** Paste channel URLs → video walls with outlier
   highlighting. Reuses `/api/inspo` patterns; pure Layer A; shippable fast; immediately
   useful. This alone beats most "content research" tools.
2. **Phase 2 — Deep dive (AI).** Onboarding wizard + Claude research + idea generation with
   proof links feeding Brainstorm.
3. **Phase 3 — The living engine.** Weekly refresh, outlier alerts ("this video is blowing up
   in your niche"), auto-suggested ideas. This is the retention feature.

## Reference material from the source session

- Live prototype UI: https://slategray-swallow-874310.hostingersite.com
- Prototype source: `Content/JBO/CONTENT-PLAN/idea-vault.html` (single file: data model for
  ideas/buckets/proofs/competitors + all UI patterns)
- YouTube fetchers (Python, portable to TS): `scratchpad/fetch_comps.py` (RSS),
  `fetch_popular2.py` (all-time top via innertube), `add_durations.py`; PHP equivalent that
  handles resolution+RSS+popular in one request: `CONTENT-PLAN` deploy's `proxy.php`
- The research prompts that produced proof-video links with verified view counts are in the
  session transcript — the key discipline: *report only verified numbers with sources; say
  "NO STRONG PROOF FOUND" rather than stretch* — bake that into the Layer B system prompt.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CreatorFlo (repo: ContentFlo)

The content OS for creators — plan, script, organize, and publish from one workspace. Started as a mirror of his Notion "JBO CONTENT PLANNER 2026" template (database 3952ff514f9780aa80cbedf5b0965aba, data source collection://a8b86f6e-7351-4ccb-bf75-8f0c75d965c1).

## What it does (Phase 1 — built)
- Kanban boards per content type (Short form / Long form / Podcast / Carousel) grouped by production status: OG Ideas → Ideas with Ref Vid → Ideas 2026 → Up Next → Packaged → Scripting → Filming → Editing → Ready for Posting → Posted
- Content Buckets board (Shorts, Carousels, Content Creation, AI Tools/Workflows, Millennial Money Mindset, Online solo biz life)
- Posting Schedule calendar + All Content table
- Card editor with per-format template sections (from the Notion page templates) plus a reference library drawer (hook formulas, hook angles, interest peaks, viral script formula, long-form script templates)
- "Brainstorm" ideation wizard: Relatable Topic × Lens (content bucket) × Who (TOF/MOF/BOF) × Action × Feeling × Format, with shuffle. Topics + buckets come from the Brand Setup profile (src/lib/profile.ts, localStorage key `jbo-planner-profile`), which also stores brand/niche/audience/socials. Setup wizard auto-opens until completed
- Data persists in localStorage (zustand persist, key `jbo-content-planner`); export/import JSON in sidebar

## Roadmap (not built yet)
- Phase 2: AI idea/script generation (Claude API via Next API routes)
- Phase 3: cross-platform publishing + analytics (Social Vista-style integrations)

## Architecture
- Next.js App Router + TypeScript, custom CSS design system in `src/app/globals.css` (call-sheet/edit-bay aesthetic: Barlow Condensed display, Inter body, JetBrains Mono meta, amber accent)
- Types/seed/ideation-data/templates/store in `src/lib/`; views in `src/components/`
- Drag-and-drop via @dnd-kit; cards move between status columns (or buckets on the buckets board)
- Dev server: `npm run dev` (port 3000), or preview via .claude/launch.json name `content-planner`

## Brand & multi-profile (added later in phase 1)
- Branding follows `Brand Media/CreatorFlo_Brand_Guidelines.md`: dark theme (#181A20 bg, #22252C surface, #F7C948 accent), Geist font, 20/14/12px radii; logos in `public/brand/`
- Multiple profiles per install: `src/lib/accounts.ts` + `src/lib/workspace.ts` swap the planner/profile localStorage keys per account; profiles are renamable (incl. the default) and deletable; switcher lives bottom-left in the sidebar (desktop) and as a Profile tab in the bottom nav (mobile)
- Brainstorm is OPT-IN per profile (`showBrainstorm`, toggled on Brand setup's first step, default off): when off it's absent from the nav and the tutorial, and the app lands on the last view, else Inspiration. Brand setup only auto-opens when a NEW profile is created; Export/Import/Reset were removed from the UI
- Brainstorm dimensions are ALL profile-driven and user-editable: content buckets, relatable topics, content formats (name + structure hint), feelings, and goal actions (CTAs). Defaults are niche-agnostic (src/lib/ideation.ts DEFAULT_* + *_SUGGESTIONS pools); the profile store (src/lib/profile.ts) holds each account's editable copy; the 6-step Setup wizard edits every dimension with tap-to-add suggestions and restore-defaults
- Desktop profile menu uses fixed positioning to escape the sidebar overflow clip
- Cards have Plan / Script / Review / Post tabs, ALL full-screen, and open on the last tab used (`cf-card-tab`) — they no longer follow the card's status, since steps are user-defined now; sections still carry a `phase`
- Sections accept pasted clipboard images (compressed to ~900px JPEG data URLs)
- Mobile (≤900px): bottom nav (Create/Pipeline/Plan) + sub-tabs + account bubble

## Accounts, cloud sync & teams (added after phase 1)
- Supabase auth (magic link / Google) + one-time Stripe purchase keyed by email (`purchases`); the server gate is `src/app/page.tsx`
- Cloud is the source of truth when signed in: `cards` (one row per card) + `profiles.data` (brand setup, inspiration, competitors). `src/lib/sync.ts` saves with optimistic concurrency on `updated_at` and three-way merges conflicts (`src/lib/merge.ts`); Realtime + presence keep teammates live
- **Teams**: a profile can be shared by email as editor/viewer — see `docs/TEAMS.md`. Owner = `profiles.user_id`; members in `profile_members`; memberships/invites are created ONLY by `/api/team/*` (service role, licence-checked). RLS in `supabase/migrations/0004_teams.sql`
- Profile ids are GLOBAL primary keys — never send the local placeholder id `"default"` to the cloud for a new user (only the first customer could ever own it)
- Deploy check: `curl https://creatorflo.io/api/version` → commit sha. Hostinger's GLIBC caps Next at 16.2.x; the image optimizer is disabled in `next.config.ts` for that reason
- Distribution is the installable web app (PWA), deliberately NOT a native/App Store build: Teams needs every device, and iOS has no off-store install anyway. `src/lib/install.ts` + `InstallPrompt` offer a one-tap install (Chrome/Edge/Android) or exact steps (iOS Share → Add to Home Screen; Safari → Add to Dock), once from the 2nd visit, never when already installed; always reachable from the sidebar / Profile menu. `UpdatePrompt` offers a reload when `/api/version` differs from the running build

## Pipelines (editable — see `src/lib/pipelines.ts`)
- The boards under "Pipeline" are PROFILE DATA (`profile.pipelines`), not a fixed list: rename them, add new ones ("+" in the sidebar / mobile tab row), drag them into any order in the sidebar (`SortableNav.tsx`; that order is used everywhere), and per pipeline rename / recolour / add / delete / drag-reorder the steps (top-bar **Customize**, `PipelineEditor.tsx`). Views are generated by `viewDefs(pipelines)`; a pipeline's board id is `board-<pipeline id>`
- `format` (the four card TEMPLATES) is separate from the pipeline (where a card LIVES) and fixed per pipeline. Cards carry `pipelineId`; legacy cards without one follow `contentType` to the built-in pipeline (`short`/`long`/`podcast`/`carousel`) — never resolve a card's board or status by hand, use `pipelineOf` / `stageOf` / `effectiveStageId` / `isDone` / `tabForStage`
- The LAST step of a pipeline is its finish line (done = leaves Content Buckets, never overdue)
- Moving a card to a pipeline with another format rebuilds its boxes on open; anything written in boxes the new layout lacks is carried along (`writtenLeftovers`), never dropped
- `sync.ts` `LATE_KEYS`: profile keys added after launch (`pipelines`, `showBrainstorm`) get restored if a stale-build client saves the blob without them. Add any new top-level profile key there

## Review tab (video feedback — `src/lib/review.ts`, `ReviewTab.tsx`, `ReviewPlayer.tsx`)
- Card tabs are Plan · Script · **Review** · Post. Paste a link to a cut; it plays on the card and teammates leave notes pinned to a moment (or general), resolve them, and add new versions (each with its own notes). Data is `card.review.versions[].comments[]` in the card body, so it syncs/merges like everything else — `mergeCard` merges review two levels deep (by version, then by comment) so simultaneous reviewers never clobber each other
- ONLY YouTube, Vimeo and Dropbox FILE links, deliberately: a timestamped note needs to read + seek the player, which those allow (YT IFrame API, Vimeo player.js, `<video>` on a Dropbox `raw=1` link). Drive/Frame.io can't, so they're refused with a reason rather than half-supported. No video hosting — Josh explicitly doesn't want storage/billing in the product yet
- `ReviewPlayer` exposes just `getTime / seek / pause`; both SDK players are POLLED for position (Vimeo sends no timeupdate for a paused seek). YT.Player replaces the node it's given — always hand it a throwaway child, never a React-owned element
- The note box sits directly under the video (watch → type where you're looking); typing pauses the video and stamps the note with the moment typing STARTED. Viewers can read but not add notes (notes live in the card, which viewers can't write)
- **Assignees**: `card.assignees` = emails picked from the profile's roster (`useTeam.roster` = owner + members, loaded by `loadRoster` on profile open and on `profile_members` realtime changes). Chips on the board tile and in the card's "Assigned to" field; hidden when signed out
- **Checkout** is a Stripe Payment Link (`BuyButton.tsx`, override with `NEXT_PUBLIC_STRIPE_PAYMENT_LINK`), not a server-created session: promo codes, price and the after-payment redirect are configured in the Stripe dashboard. The link's redirect must be `https://creatorflo.io/thank-you?session_id={CHECKOUT_SESSION_ID}` for the Purchase pixel to fire. `/api/checkout` is unused but kept
- **Identity** (`0005_user_profiles.sql`): display name + inline avatar (128px JPEG data URL) per account in `user_profiles` — readable by any signed-in user, writable only by its owner. Client: `useTeam.directory` (by user id), loaded with the roster and refreshed live; `personName(email)` / `<Avatar email>` / `<Name email>` are the ONLY ways to render a person. Edited from the bottom-left menu (`IdentityDialog`). Until the migration is run, saving says so and everyone shows as initials + email-derived names
- **Filters & sort** (`src/lib/viewPrefs.ts`, `FilterBar.tsx`): PERSONAL — never visible to teammates, but synced across the user's OWN devices: localStorage (`cf-view:<uid>:<profile>:<view>`) for instant paint + `view_prefs` table (`0006_view_prefs.sql`, own-rows-only RLS), newest `at` wins, pulled on open/focus, pushed debounced. Boards: Mine toggle, filter popover (assignees/unassigned, bucket, format, posting window, open review notes; "More" = funnel/topic/lens/feeling/goal), sort menu (Manual default, Newest, Oldest, Title A–Z, Posting date, Recently edited). Manual order is also personal (`order[colId]` = card ids). Dragging within a column under any non-Manual sort switches that user's board to Manual, snapshotting every column's current order first. Only status/content changes are shared. All Content: same filters + Pipeline/Status, headers sort asc → desc → off
- **Copy / paste cards** (`src/lib/cardClipboard.ts`): right-click a card (Copy / Duplicate / Paste here) or an empty column spot (Paste here); Cmd/Ctrl+C copies the board selection, Cmd/Ctrl+V pastes into the first column. Clipboard is localStorage (`cf-card-clipboard`), so it survives profile switches. Paste = fresh ids, target pipeline/format/step; a different format converts like changing pipeline (empty card → new template; written → rebuilt on open with leftovers kept); across profiles, buckets match by name and assignees are kept only if on the new roster. Undo via `insertCards`
- Thumbnail (`ThumbnailField` in CardModal): Paste image button (async Clipboard API; falls back to focusing the box for ⌘V), Choose file/Replace, the corner X to remove (Josh prefers it to a Remove button), drop. ⌘V is caught at DOCUMENT level while the box has focus — Safari won't deliver paste to a focused non-text element
- Top-bar search is `SearchBox.tsx`: collapses to an icon when its slot is < 130px wide; the icon opens it across the whole top bar
- Card delete (trash in the card header) always confirms first


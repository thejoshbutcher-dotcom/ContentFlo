# CreatorFlo MCP Connector — Handoff

*Written Sep 29, 2026, from the CAPW session (the one that plans Josh's YouTube videos).
Build this in the CreatorFlo repo, ship it with the app, and test it end to end before
anyone on the team connects it.*

## The goal

A **remote MCP server** built into CreatorFlo so any AI client (Claude desktop, Claude
Code, claude.ai, ChatGPT/Codex) can read and write the planning board, the way it uses the
Notion connector today. Two sessions are waiting on it:

- **The CAPW planning session** writes video outlines, hooks, titles, and references into
  cards (today it does this with a one-off script and the service-role key; see
  `CAPW/creatorflo-sync/` in the Claude Code folder for exactly what it writes).
- **The Final Cut editing agent** (`Video Editing/`) reads a card's Outline to turn
  "Step N: Name" / "Phase N: Name" / "▸ Name" lines into step cards, checkpoints, and
  chapter markers. It reads Notion today; it switches to CreatorFlo once this exists.

**How people connect it:** it's a URL, like any third-party connector. Nothing to install.

- **Claude desktop / claude.ai:** Customize → Connectors → **Add custom connector** → Name
  `CreatorFlo`, URL `https://creatorflo.io/api/mcp` → Add → **Connect** → a browser window
  opens the CreatorFlo sign-in → they sign in with their own CreatorFlo account → Allow.
  Then quit and reopen Claude (a connector added while a chat is open never appears in
  that chat).
- **Claude Code (CLI):** `claude mcp add --transport http creatorflo https://creatorflo.io/api/mcp`,
  then `/mcp` to sign in.
- **Team or Enterprise Claude plans:** an org owner can add it once for everyone in the
  org's connector settings; each person still signs in with their own CreatorFlo account.
- **Where it lives:** the server is code in this repo (for example `src/app/api/mcp/route.ts`
  plus `src/lib/mcp/`), deployed with the app to Hostinger. Claude only stores the URL and
  each user's sign-in token. Each person sees exactly what CreatorFlo lets them see: their
  own profiles plus boards shared with them as editor or viewer.

## Non-negotiables

1. **Every request acts as the signed-in user, never as an admin.** Viewers can read but
   not write; people can't see profiles they aren't on. This matches the app's RLS
   (`supabase/migrations/0004_teams.sql`). The service-role key must never be what decides
   access for an MCP request.
2. **Never clobber anyone.** Cards are live-edited by teammates with realtime sync. Every
   write reads the row, changes only what it was asked to, bumps `body.updatedAt` and the
   row's `updated_at`, and saves with compare-and-swap on the old `updated_at`. If the
   card changed in between, return a clear "card changed, re-read it" error instead of
   overwriting. (`src/lib/sync.ts` and `src/lib/merge.ts` are the app's rules; follow them.)
3. **Licence gate.** Same rule as the app (`src/lib/entitlement.ts` `hasPurchase` /
   admin emails, and team membership for shared profiles). No licence, no tools.
4. **No hard deletes.** v1 has no delete tool. If one is added later, it tombstones
   (`deleted_at`) and requires `confirm: true`.

## Auth: OAuth 2.1, the way Claude's custom connectors expect it

Claude's custom connectors support servers with no auth or with OAuth. Use OAuth so each
teammate signs in as themselves. Follow the MCP authorization spec:

- Unauthenticated requests to `/api/mcp` get `401` with
  `WWW-Authenticate: Bearer resource_metadata="https://creatorflo.io/.well-known/oauth-protected-resource"`.
- Serve `/.well-known/oauth-protected-resource` (RFC 9728) pointing at the authorization
  server, and the authorization server metadata (`/.well-known/oauth-authorization-server`).
- Support **dynamic client registration** (Claude registers itself), **authorization code +
  PKCE**, and refresh tokens.
- The authorize page reuses CreatorFlo's existing sign-in (magic link / Google via
  Supabase), then shows a one-screen consent: "Allow Claude to read and edit your
  CreatorFlo boards?"

Two ways to get there. Check the first before building the second:

- **A. Supabase Auth as the OAuth 2.1 server**, if the project's Supabase plan and version
  offer it. Then the access token is a real Supabase user JWT, and a user-scoped Supabase
  client makes RLS enforce everything automatically. Least code, strongest guarantee.
- **B. A small OAuth server inside CreatorFlo.** The authorize endpoint requires a
  CreatorFlo session and issues a short-lived code; the token endpoint swaps it for an
  opaque access token plus a refresh token, stored **hashed** in a new `mcp_tokens` table
  (`user_id`, `client_id`, `scopes`, `expires_at`, `revoked_at`). Each MCP request
  resolves the token to a user, then checks profile access explicitly (owner, or a row in
  `profile_members` with the right role) before any read or write, reusing the teams
  logic. Add a "Connected apps" list in account settings to revoke tokens.

`src/proxy.ts` (Next 16's middleware) must let `/api/mcp` and `/.well-known/*` through
without the sign-in redirect.

## Transport

- MCP **Streamable HTTP** at `POST /api/mcp` (plus `GET` for the stream if you keep one),
  using the official TypeScript SDK (`@modelcontextprotocol/sdk`) or an adapter for Next.js
  route handlers. Check the current packages; don't guess APIs from memory.
- Prefer **stateless** mode with plain JSON responses. It avoids long-lived streams, which
  shared hosting proxies can cut. Test SSE behind Hostinger before relying on it.
- Hostinger's GLIBC keeps Next at 16.2.x (see CLAUDE.md). Whatever you add must run there.

## Tools (v1)

Mark read tools `readOnlyHint: true` so clients can allow them without prompting. Inputs
are validated. Errors come back as plain sentences.

| Tool | Does | Notes |
|---|---|---|
| `list_boards` | The profiles the user can access: id, name, role (owner/editor/viewer), and each pipeline's steps | Read-only |
| `list_cards` | Cards on a board, filter by `pipeline`, `status` (step name or id), `search` (title) | Read-only. Returns id, title, pipeline, status name, assignees, posting date, `updated_at`. No thumbnails (they're large data URLs) |
| `get_card` | One card: metadata + every box, content as **Markdown** | Read-only. Include each box's title and phase (plan/script/review/post) and the card's `updated_at` |
| `get_outline_chapters` | Parses the Outline box into a list: `{kind: step\|phase\|sub, name, planned_start, planned_range}` plus the Chapters block | Read-only. This is what the Final Cut agent calls |
| `update_box` | Writes one box: `card_id`, `box` (title), `content` (Markdown), `mode` = `replace` \| `append` \| `fill_if_empty`, optional `expected_updated_at` | Default `fill_if_empty`. Refuses on conflict. Viewers get "you have view access only" |
| `create_card` | New card on a board: `board`, `pipeline`, `status`, `title`, optional `boxes` (title → Markdown) | Builds sections from the pipeline's format template (`src/lib/templates.ts`), ids via `newId` |
| `move_card` | Change a card's step | Updates `status` in both the row and `body` |

Nice later: `add_reference` (a YouTube link into References with the inspiration-card
format), `get_brand_profile`, `add_review_note`.

## Card format (what's actually in the database)

- Table `public.cards`: `id`, `profile_id`, `user_id` (the profile owner), `title`,
  `status`, `content_type`, `posting_date`, `body` (the full `ContentCard`), `updated_at`,
  `deleted_at`. The promoted columns must always match `body` (`cardToRow` in
  `src/lib/mapping.ts` is the reference).
- `body.sections[]`: `{ id, title, hint, kind: "text", phase, content, placeholder?, allowRefs?, refs? }`.
  `content` is the editor's HTML (Tiptap StarterKit: `p`, `strong`, `em`, `a`, `ul/ol > li > p`,
  nested lists, `h1–h3`, `hr`, `pre > code`, task lists).
- Long-form boxes: Goal of Video, Title Ideas, Thumbnail Ideas (3–5 words), Video &
  Thumbnail References, **Outline**, **Script**, Video Description for YouTube, Email.
- `body.pipelineId` decides the board; `status` is a step id from that pipeline
  (`profile.data.pipelines`). Resolve names ↔ ids with `pipelineOf` / `stageOf` in
  `src/lib/pipelines.ts`; never guess.
- **Markdown ↔ HTML:** convert on the way in and out so AI clients work in Markdown.
  Reuse `src/lib/richtext.ts` where it fits. Tabs or two spaces mean nested list items,
  and fenced code blocks become `pre > code`. The converter in `CAPW/creatorflo-sync/build.py`
  produced HTML that renders correctly in the app; match its output.

## The outline convention the editing agent relies on

The Outline box is written like this (keep `get_outline_chapters` in sync with it):

```
**Intro** (0:00–1:00)
- bullets
---
**Step 1: Getting Set Up** (1:00–4:30)
- ▸ **Higgsfield Connector** (2:30)
**Step 3: The Build** (5:30–9:30)
- **Phase 1: Tell Me About It** (6:00–7:30)
### Chapters (planned times; the edit sets the real ones)
    00:00 - Intro
    01:00 - Step 1: Getting Set Up
```

`Step N: Name` gets a step card, `Phase N: Name` is a checkpoint inside a step with its own
card, `▸ Name` is a chapter with no card. The Chapters code block is the ordered list of
chapter names with planned times.

## Test before handing it to the team

1. **MCP Inspector** (`npx @modelcontextprotocol/inspector`) against local dev: the OAuth
   flow completes, every tool lists and runs.
2. **Permissions:** an owner can write; an editor on a shared board can write; a
   **viewer's** `update_box` is refused; a stranger can't list or read the board.
3. **Conflict:** open a card in the app, type, then call `update_box` with a stale
   `expected_updated_at`: it refuses, and nothing typed in the app is lost.
4. **Round trip:** `get_card` → `update_box replace` with the same Markdown → the box
   looks identical in the app (lists, bold, links, code blocks).
5. **Live:** deploy, check `https://creatorflo.io/api/version`, add the connector in Claude
   desktop with the real URL, restart, ask "list my CreatorFlo boards", then write a test
   box on a throwaway card and delete that card in the app afterwards.
6. `get_outline_chapters` on the four CAPW cards (Opus 5.5, Beginners "The EASY way…",
   Vibe Coding, Claude vs Astra) returns their steps, phases, and chapters correctly.

## Done means

- Josh and a teammate each connect it in Claude desktop with just the URL and their own
  sign-in.
- The CAPW session can list, read, fill, and create cards without the service-role script.
- A short `docs/MCP.md` for customers: the URL, the three-step connect, what the tools do,
  and how to revoke access.
- Then, separately, the `Video Editing/` agent's HANDOFF/jobs README switches its outline
  source from Notion to `get_outline_chapters`, and `CAPW/CLAUDE.md` retires the sync script.

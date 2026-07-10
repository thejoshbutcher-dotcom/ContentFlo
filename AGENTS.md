<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
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
- App loads on Brainstorm; Brand setup only auto-opens when a NEW profile is created; Export/Import/Reset were removed from the UI
- Brainstorm dimensions are ALL profile-driven and user-editable: content buckets, relatable topics, content formats (name + structure hint), feelings, and goal actions (CTAs). Defaults are niche-agnostic (src/lib/ideation.ts DEFAULT_* + *_SUGGESTIONS pools); the profile store (src/lib/profile.ts) holds each account's editable copy; the 6-step Setup wizard edits every dimension with tap-to-add suggestions and restore-defaults
- Desktop profile menu uses fixed positioning to escape the sidebar overflow clip
- Cards have Plan/Script/Post tabs that auto-select from status (Ideas→Plan, Scripting/Filming/Editing→Script, Ready/Posted→Post); sections carry a `phase`
- Sections accept pasted clipboard images (compressed to ~900px JPEG data URLs)
- Mobile (≤900px): bottom nav (Create/Pipeline/Plan) + sub-tabs + account bubble

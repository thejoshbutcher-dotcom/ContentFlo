# Teams — sharing a profile

A **profile** is the unit of sharing: one channel's boards, calendar, inspiration
library, competitors and brand setup. The owner invites people by email as
**editor** (full read/write) or **viewer** (read-only). Everyone needs their own
CreatorFlo licence; an invite to someone who hasn't bought yet simply waits until
they do.

## Turning it on (one time)

1. Supabase → SQL Editor → paste and run `supabase/migrations/0004_teams.sql`.
   It is idempotent. Until it's run the app behaves exactly as before and the
   share dialog reports "Sharing isn't switched on yet."
2. *(Optional — invite emails.)* Add to the Hostinger environment, then redeploy:

   ```
   SMTP_HOST=smtp.hostinger.com
   SMTP_PORT=465
   SMTP_USER=hello@creatorflo.io        # the mailbox Supabase Auth already sends from
   SMTP_PASS=…                          # that mailbox's password
   SMTP_FROM=CreatorFlo <hello@creatorflo.io>
   ```

   Without these, invites still work — they appear as a banner the next time the
   invitee opens the app — they just aren't announced by email.

## How it's enforced

| Layer | What it guarantees |
| --- | --- |
| **RLS** (`0004_teams.sql`) | Rows are readable by owner + members, writable by owner + editors. `profile_members` and `profile_invites` have **no insert policy**: only the server routes (service role) create them. |
| **Triggers** | `guard_profile_update` stops an editor changing a profile's `user_id`/`name` (no takeovers). `pin_card_owner` keeps `cards.user_id` = the profile owner, so deleting an editor's account can't cascade-delete the owner's cards. |
| **`/api/team/invite`** | Caller must be signed in, licensed, and the profile's owner. Inviter email + profile name come from the session/DB, never the request. 25 pending invites per profile max. |
| **`/api/team/accept`** | The only place a membership is created. Matches the invite against the **session's** email and re-checks the licence — the database is reachable with any signed-in session, so the licence gate has to live here. |
| **Client** | `src/lib/access.ts` makes both stores no-ops for a viewer; the editor goes non-editable. Belt and braces — RLS rejects the writes regardless. |

The RLS suite (56 assertions: strangers, pending invitees, editors, viewers,
promotion, removal, leaving, takeover attempts, anon) runs against PGlite with a
stubbed `auth` schema — `supabase/tests/rls.test.mjs`; re-run it after any policy change. The merge suite is `tests/merge.test.mjs`.

## Sync, now that two people can write

`src/lib/sync.ts` — every row's `updated_at` is a version token, fresh on each save.

- **Save** = `update … where updated_at = <the version we started from>`. If that
  matches nothing, someone else saved first: fetch theirs, three-way merge
  against the last common version (`src/lib/merge.ts`), save again.
- **Merge unit** = a top-level card field, a whole section, or one inspiration /
  competitor item. Two people in different boxes of the same card both keep
  their work. Two people typing in the *same* box is last-write-wins (true
  co-typing would need a CRDT server; out of scope).
- **Live** = Supabase Realtime `postgres_changes` on the open profile's cards +
  profile row. Events only say *which* card changed; the row is then fetched, so
  a card with pasted images can't arrive truncated.
- **Catch-up** = on tab focus and on socket re-subscribe, versions are compared
  and only what moved is fetched. (This also fixes stale tabs for solo users
  with two devices.)
- **Presence** = same channel. Avatars in the top bar, a dot on any card a
  teammate has open, "is here too" inside the card.

## Later (not built)

- Owner buys a seat for an unlicensed invitee (Stripe product + a claim code the
  invite redeems into a `purchases` row).
- Transfer ownership. Activity log. Comments.

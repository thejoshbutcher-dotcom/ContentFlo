-- Access is granted by PURCHASE, and a purchase happens before the account
-- exists. So entitlement must be keyed by EMAIL, not by user_id.
--
-- `entitlements` (from 0001) was keyed by user_id, which cannot be populated by
-- a Stripe webhook for someone who has not signed up yet. It is empty; replace it.

drop table if exists public.entitlements;

create table if not exists public.purchases (
  -- The Stripe Checkout Session id. Also makes webhook replays idempotent.
  id                    text primary key,
  email                 text not null,
  status                text not null default 'active',   -- active | refunded
  stripe_customer_id    text,
  stripe_payment_intent text,
  purchased_at          timestamptz not null default now()
);

-- Email match must be case-insensitive: Stripe returns whatever the buyer typed.
create index if not exists purchases_email_idx
  on public.purchases (lower(email));

alter table public.purchases enable row level security;

-- Deliberately NO policies and NO grants to anon/authenticated. Only the
-- service role (which bypasses RLS) reads or writes this table, from server
-- code. A signed-in user can never see or forge their own entitlement.
grant all on public.purchases    to service_role;
grant all on public.stripe_events to service_role;

-- 0002 granted the app tables to `authenticated` but not to `service_role`,
-- so server-side admin reads failed with 42501.
grant all on public.profiles to service_role;
grant all on public.cards    to service_role;

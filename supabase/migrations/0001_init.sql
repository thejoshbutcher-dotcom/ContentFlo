-- CreatorFlo: profiles, cards, entitlements.
--
-- Text primary keys (not uuid) are deliberate: the client already generates ids
-- via newId() ("card-abc-1-xyz") and the original profile id is the literal
-- string "default". Text PKs let the localStorage importer carry existing rows
-- over verbatim, with zero id remapping.

-- ————— Brand profiles (the existing multi-account "accounts") —————
create table if not exists public.profiles (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  data       jsonb not null default '{}'::jsonb,   -- the whole ProfileData blob
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_user_idx on public.profiles(user_id);

-- ————— Cards: one row per card —————
-- CardModal writes on every keystroke. One row per card means a debounced flush
-- touches a single small row, and two devices editing different cards never
-- conflict. Sections/images are nested and never queried alone, so they live in
-- `body`. Only the columns the board/calendar/table filter on are promoted.
create table if not exists public.cards (
  id           text primary key,
  profile_id   text not null references public.profiles(id) on delete cascade,
  -- Denormalized so RLS is a cheap column compare instead of a join.
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null default '',
  status       text not null default 'ideas',
  content_type text,
  posting_date date,
  body         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Tombstone. Without this, a stale device re-upserts a card deleted elsewhere.
  deleted_at   timestamptz
);

create index if not exists cards_profile_idx
  on public.cards(profile_id) where deleted_at is null;
create index if not exists cards_user_idx on public.cards(user_id);

-- ————— One-time purchase entitlement —————
create table if not exists public.entitlements (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  product               text not null default 'creatorflo_lifetime',
  status                text not null default 'active',   -- active | refunded
  stripe_customer_id    text,
  stripe_payment_intent text,
  purchased_at          timestamptz not null default now()
);

-- Stripe retries webhooks; this makes delivery idempotent.
create table if not exists public.stripe_events (
  id         text primary key,
  created_at timestamptz not null default now()
);

-- ————— Row Level Security —————
alter table public.profiles     enable row level security;
alter table public.cards        enable row level security;
alter table public.entitlements enable row level security;
alter table public.stripe_events enable row level security;  -- service role only

drop policy if exists "own_profiles" on public.profiles;
create policy "own_profiles" on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own_cards" on public.cards;
create policy "own_cards" on public.cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Users may read their entitlement. Only the Stripe webhook, using the
-- service-role key (which bypasses RLS), ever writes it.
drop policy if exists "read_own_entitlement" on public.entitlements;
create policy "read_own_entitlement" on public.entitlements
  for select using (user_id = auth.uid());

-- ————— Storage: pasted screenshots —————
-- Path convention: {user_id}/{profile_id}/{card_id}/{uuid}.jpg
insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do nothing;

drop policy if exists "own_card_images_rw" on storage.objects;
create policy "own_card_images_rw" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

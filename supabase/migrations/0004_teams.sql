-- Teams: share a profile (one channel's boards, inspiration, competitors and
-- brand setup) with other CreatorFlo owners, as editor or viewer.
--
-- The OWNER stays `profiles.user_id` — there is no owner row in
-- `profile_members`, so ownership has exactly one source of truth and can't
-- drift. Members are everyone else.
--
-- Safe to re-run. Safe to deploy the app before OR after running this: the
-- client treats a missing `profile_members` table as "no sharing".

-- ————— Tables —————
create table if not exists public.profile_members (
  profile_id    text not null references public.profiles(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('editor', 'viewer')),
  email         text not null,           -- the member's, for the team list
  inviter_email text,                    -- "Shared by …" in the switcher
  created_at    timestamptz not null default now(),
  primary key (profile_id, user_id)
);

create index if not exists profile_members_user_idx
  on public.profile_members(user_id);

-- An invite is addressed to an EMAIL: the invitee may not have an account (or
-- a licence) yet. It turns into a membership only through the server route,
-- which checks the licence first.
create table if not exists public.profile_invites (
  id            uuid primary key default gen_random_uuid(),
  profile_id    text not null references public.profiles(id) on delete cascade,
  email         text not null check (email = lower(email)),
  role          text not null check (role in ('editor', 'viewer')),
  invited_by    uuid not null references auth.users(id) on delete cascade,
  inviter_email text,
  profile_name  text not null default '',   -- shown to the invitee pre-access
  created_at    timestamptz not null default now(),
  unique (profile_id, email)
);

create index if not exists profile_invites_email_idx
  on public.profile_invites(email);

-- ————— Access helpers —————
-- SECURITY DEFINER so policies can consult `profiles`/`profile_members`
-- without re-entering their own RLS (which would recurse). Each returns a
-- SET, used as `x in (select f())`: Postgres evaluates that once per
-- statement, not once per row.
create or replace function public.owned_profile_ids()
returns setof text
language sql stable security definer set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid()
$$;

create or replace function public.readable_profile_ids()
returns setof text
language sql stable security definer set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid()
  union
  select profile_id from public.profile_members where user_id = auth.uid()
$$;

create or replace function public.editable_profile_ids()
returns setof text
language sql stable security definer set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid()
  union
  select profile_id from public.profile_members
   where user_id = auth.uid() and role = 'editor'
$$;

revoke all on function public.owned_profile_ids()    from public;
revoke all on function public.readable_profile_ids() from public;
revoke all on function public.editable_profile_ids() from public;
grant execute on function public.owned_profile_ids()    to authenticated;
grant execute on function public.readable_profile_ids() to authenticated;
grant execute on function public.editable_profile_ids() to authenticated;

-- ————— Guards that RLS alone can't express —————
-- RLS's WITH CHECK sees only the new row, so it cannot say "an editor may
-- change `data` but not `user_id`". Without this, an editor could rewrite
-- `user_id` to themselves and take the profile over.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- auth.uid() is null for the service role, which is trusted.
  if auth.uid() is not null and auth.uid() <> old.user_id then
    new.user_id := old.user_id;
    new.name    := old.name;
    new.sort    := old.sort;
  end if;
  new.id := old.id;
  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- `cards.user_id` cascades on user deletion. If it recorded whoever saved
-- last, deleting an editor's account would delete the owner's cards. Pin it to
-- the profile's owner, whatever the client sends.
create or replace function public.pin_card_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  owner uuid;
begin
  select user_id into owner from public.profiles where id = new.profile_id;
  if owner is not null then
    new.user_id := owner;
  end if;
  return new;
end;
$$;

drop trigger if exists cards_pin_owner on public.cards;
create trigger cards_pin_owner
  before insert or update on public.cards
  for each row execute function public.pin_card_owner();

-- ————— Policies: profiles —————
alter table public.profile_members enable row level security;
alter table public.profile_invites enable row level security;

drop policy if exists "own_profiles" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_delete" on public.profiles;

create policy "profiles_select" on public.profiles
  for select using (id in (select public.readable_profile_ids()));

create policy "profiles_insert" on public.profiles
  for insert with check (user_id = auth.uid());

-- Editors write `data` (inspiration, competitors, brand setup); the trigger
-- above stops them touching anything else.
create policy "profiles_update" on public.profiles
  for update
  using (id in (select public.editable_profile_ids()))
  with check (id in (select public.editable_profile_ids()));

create policy "profiles_delete" on public.profiles
  for delete using (user_id = auth.uid());

-- ————— Policies: cards —————
drop policy if exists "own_cards" on public.cards;
drop policy if exists "cards_select" on public.cards;
drop policy if exists "cards_insert" on public.cards;
drop policy if exists "cards_update" on public.cards;
drop policy if exists "cards_delete" on public.cards;

create policy "cards_select" on public.cards
  for select using (profile_id in (select public.readable_profile_ids()));

create policy "cards_insert" on public.cards
  for insert with check (profile_id in (select public.editable_profile_ids()));

-- USING guards the row as it is, WITH CHECK the row as it will be — so a card
-- can't be moved into a profile the caller may not edit.
create policy "cards_update" on public.cards
  for update
  using (profile_id in (select public.editable_profile_ids()))
  with check (profile_id in (select public.editable_profile_ids()));

create policy "cards_delete" on public.cards
  for delete using (profile_id in (select public.editable_profile_ids()));

-- ————— Policies: members —————
-- There is deliberately NO insert policy: a membership is created only by the
-- accept-invite server route (service role), after the licence check.
drop policy if exists "members_select" on public.profile_members;
drop policy if exists "members_update" on public.profile_members;
drop policy if exists "members_delete" on public.profile_members;

-- Everyone on a profile can see who else is on it.
create policy "members_select" on public.profile_members
  for select using (profile_id in (select public.readable_profile_ids()));

-- Only the owner changes roles.
create policy "members_update" on public.profile_members
  for update
  using (profile_id in (select public.owned_profile_ids()))
  with check (profile_id in (select public.owned_profile_ids()));

-- The owner removes anyone; a member removes themselves (leave).
create policy "members_delete" on public.profile_members
  for delete using (
    user_id = auth.uid()
    or profile_id in (select public.owned_profile_ids())
  );

-- ————— Policies: invites —————
-- No insert policy either: invites are created by the server route so the
-- email, inviter and profile name can't be forged.
drop policy if exists "invites_select" on public.profile_invites;
drop policy if exists "invites_delete" on public.profile_invites;

create policy "invites_select" on public.profile_invites
  for select using (
    profile_id in (select public.owned_profile_ids())
    or email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- The owner revokes; the invitee declines.
create policy "invites_delete" on public.profile_invites
  for delete using (
    profile_id in (select public.owned_profile_ids())
    or email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ————— Privileges —————
grant select, update, delete on public.profile_members to authenticated;
grant select, delete         on public.profile_invites to authenticated;
grant all on public.profile_members to service_role;
grant all on public.profile_invites to service_role;

-- ————— Realtime —————
-- Live updates between teammates. Realtime applies the SELECT policies above
-- per subscriber, so nobody receives rows they couldn't query.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.cards;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.profiles;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.profile_members;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.profile_invites;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

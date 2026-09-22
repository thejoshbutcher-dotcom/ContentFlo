-- Display name + avatar per account, so teammates see "Sam" with a face
-- instead of sam.jones@studio.com. Safe to re-run.
--
-- The avatar is a small JPEG data URL (~128px, a few KB) stored inline: no
-- storage bucket, no extra policies, and it travels with the row.

create table if not exists public.user_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null default '' check (char_length(name) <= 60),
  avatar     text check (avatar is null or (avatar like 'data:image/jpeg;base64,%' and char_length(avatar) <= 40000)),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select" on public.user_profiles;
drop policy if exists "user_profiles_insert" on public.user_profiles;
drop policy if exists "user_profiles_update" on public.user_profiles;

-- Any signed-in user can read names and avatars (that's their purpose);
-- lookups are by user id, so nobody can pose as someone else.
create policy "user_profiles_select" on public.user_profiles
  for select to authenticated using (true);

create policy "user_profiles_insert" on public.user_profiles
  for insert to authenticated with check (user_id = auth.uid());

create policy "user_profiles_update" on public.user_profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.user_profiles;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

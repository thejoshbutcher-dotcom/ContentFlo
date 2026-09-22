-- Each person's own board/table views — filters, sort, manual card order —
-- synced across THEIR devices. Private: nobody else can read or write them.
-- Safe to re-run.

create table if not exists public.view_prefs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null check (char_length(key) <= 200),   -- "<profile id>:<view id>"
  prefs      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.view_prefs enable row level security;

drop policy if exists "view_prefs_own" on public.view_prefs;
create policy "view_prefs_own" on public.view_prefs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.view_prefs to authenticated;
grant all on public.view_prefs to service_role;

-- Fixes 42501 "permission denied for table ..." after 0001.
--
-- RLS decides WHICH ROWS a role may see; GRANT decides whether the role may
-- touch the table at all. Tables created from the SQL editor receive no grants
-- by default, so the policies in 0001 were correct but unreachable.
--
-- Deliberately no grants to `anon`: a signed-out visitor cannot read or write
-- any table. Only `authenticated` (scoped further by RLS) and `service_role`
-- (the Stripe webhook) get access.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.cards    to authenticated;
grant select on public.entitlements to authenticated;

grant all on public.entitlements  to service_role;
grant all on public.stripe_events to service_role;

// RLS suite for supabase/migrations. Runs the real SQL in an in-memory Postgres
// (PGlite) with a stubbed auth schema. Not a devDependency on purpose — run:
//   npm i --no-save @electric-sql/pglite && node supabase/tests/rls.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const M = new URL("../migrations/", import.meta.url).pathname.replace(/%20/g, " ");
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
grant usage on schema auth to authenticated, anon, service_role;
create publication supabase_realtime;
`);
for (const f of ["0001_init.sql","0002_grants.sql","0003_purchases.sql","0004_teams.sql","0004_teams.sql","0005_user_profiles.sql","0005_user_profiles.sql","0006_view_prefs.sql","0006_view_prefs.sql"]) {
  await db.exec(fs.readFileSync(M+f,"utf8"));
}
const U = { owner:"00000000-0000-0000-0000-000000000001", editor:"00000000-0000-0000-0000-000000000002", viewer:"00000000-0000-0000-0000-000000000003", stranger:"00000000-0000-0000-0000-000000000004" };
for (const [k,id] of Object.entries(U)) await db.query(`insert into auth.users values ($1,$2)`,[id,`${k}@x.com`]);

let pass=0, fail=0;
async function as(who, sql, params=[]) {
  await db.exec(`reset role`);
  if (who === "service") { await db.exec(`select set_config('request.jwt.claims','',false); set role service_role`); }
  else { await db.exec(`select set_config('request.jwt.claims','${JSON.stringify({sub:U[who],email:`${who.toUpperCase()}@x.com`.toLowerCase()})}',false); set role authenticated`); }
  try { const r = await db.query(sql, params); return { rows:r.rows, n:r.affectedRows ?? r.rows.length }; }
  catch (e) { return { err: e.message }; }
  finally { await db.exec(`reset role`); }
}
function ok(name, cond, extra="") { if (cond) { pass++; console.log("  ok  ", name); } else { fail++; console.log("FAIL  ", name, extra); } }
const j = (x)=>JSON.stringify(x);

// — setup: owner creates two profiles + cards
let r = await as("owner", `insert into profiles (id,user_id,name) values ('chanA',$1,'Channel A'),('chanB',$1,'Channel B')`,[U.owner]);
ok("owner creates profiles", !r.err, r.err);
r = await as("owner", `insert into cards (id,profile_id,user_id,title,body) values ('a1','chanA',$1,'A one','{}'),('b1','chanB',$1,'B one','{}')`,[U.owner]);
ok("owner creates cards", !r.err, r.err);
r = await as("stranger", `insert into profiles (id,user_id,name) values ('evil',$1,'x')`,[U.owner]);
ok("can't create a profile owned by someone else", !!r.err);

// — before sharing: nobody else sees anything
for (const w of ["editor","viewer","stranger"]) {
  r = await as(w, `select id from profiles`); ok(`${w} sees no profiles pre-share`, r.rows.length===0, j(r));
  r = await as(w, `select id from cards`);    ok(`${w} sees no cards pre-share`, r.rows.length===0, j(r));
}

// — memberships can't be self-granted
r = await as("stranger", `insert into profile_members (profile_id,user_id,role,email) values ('chanA',$1,'editor','s@x.com')`,[U.stranger]);
ok("stranger can't self-insert membership", !!r.err, j(r));
r = await as("owner", `insert into profile_members (profile_id,user_id,role,email) values ('chanA',$1,'editor','e@x.com')`,[U.editor]);
ok("even owner can't insert membership directly (server route only)", !!r.err, j(r));
r = await as("stranger", `insert into profile_invites (profile_id,email,role,invited_by) values ('chanA','stranger@x.com','editor',$1)`,[U.stranger]);
ok("stranger can't forge an invite", !!r.err, j(r));

// — service role creates invites + memberships (what the API routes do)
r = await as("service", `insert into profile_invites (profile_id,email,role,invited_by,inviter_email,profile_name) values ('chanA','editor@x.com','editor',$1,'owner@x.com','Channel A'),('chanA','viewer@x.com','viewer',$1,'owner@x.com','Channel A')`,[U.owner]);
ok("service creates invites", !r.err, r.err);
r = await as("editor", `select email from profile_invites`); ok("invitee sees only own invite", r.rows.length===1 && r.rows[0].email==="editor@x.com", j(r));
r = await as("stranger", `select email from profile_invites`); ok("stranger sees no invites", r.rows.length===0, j(r));
r = await as("owner", `select email from profile_invites`); ok("owner sees both invites", r.rows.length===2, j(r));
r = await as("editor", `select id from cards`); ok("pending invite grants NO card access", r.rows.length===0, j(r));

r = await as("service", `insert into profile_members (profile_id,user_id,role,email,inviter_email) values ('chanA',$1,'editor','editor@x.com','owner@x.com'),('chanA',$2,'viewer','viewer@x.com','owner@x.com')`,[U.editor,U.viewer]);
ok("service creates memberships", !r.err, r.err);

// — reads
for (const w of ["editor","viewer"]) {
  r = await as(w, `select id from profiles order by id`); ok(`${w} sees ONLY shared profile`, j(r.rows)===j([{id:"chanA"}]), j(r));
  r = await as(w, `select id from cards order by id`);    ok(`${w} sees ONLY shared profile's cards`, j(r.rows)===j([{id:"a1"}]), j(r));
  r = await as(w, `select email from profile_members order by email`); ok(`${w} sees the team list`, r.rows.length===2, j(r));
}
r = await as("stranger", `select * from profile_members`); ok("stranger sees no members", r.rows.length===0, j(r));
r = await as("stranger", `select id from cards`); ok("stranger still sees no cards", r.rows.length===0);

// — editor writes
r = await as("editor", `update cards set title='edited' where id='a1'`); ok("editor updates shared card", r.n===1, j(r));
r = await as("service", `select user_id from cards where id='a1'`); ok("card stays pinned to OWNER after editor save", r.rows[0].user_id===U.owner, j(r));
r = await as("editor", `insert into cards (id,profile_id,user_id,title,body) values ('a2','chanA',$1,'by editor','{}')`,[U.editor]); ok("editor adds card", !r.err, r.err);
r = await as("service", `select user_id from cards where id='a2'`); ok("editor-created card pinned to OWNER", r.rows[0].user_id===U.owner, j(r));
r = await as("editor", `update cards set title='hax' where id='b1'`); ok("editor can't touch unshared profile's card", r.n===0, j(r));
r = await as("editor", `update cards set profile_id='chanB' where id='a2'`); ok("editor can't move a card into an unshared profile", !!r.err || r.n===0, j(r));
r = await as("editor", `insert into cards (id,profile_id,user_id,title,body) values ('b2','chanB',$1,'x','{}')`,[U.editor]); ok("editor can't insert into unshared profile", !!r.err, j(r));
r = await as("editor", `update profiles set data='{"inspo":[1]}' where id='chanA'`); ok("editor updates profile data", r.n===1, j(r));
r = await as("editor", `update profiles set user_id=$1, name='stolen' where id='chanA'`,[U.editor]);
r = await as("service", `select user_id,name,data from profiles where id='chanA'`); ok("editor CANNOT take over ownership or rename", r.rows[0].user_id===U.owner && r.rows[0].name==="Channel A", j(r));
r = await as("editor", `delete from profiles where id='chanA'`); ok("editor can't delete the profile", r.n===0, j(r));
r = await as("editor", `update profile_members set role='editor' where user_id=$1`,[U.viewer]); ok("editor can't change roles", r.n===0, j(r));
r = await as("editor", `delete from profile_members where user_id=$1`,[U.viewer]); ok("editor can't remove other members", r.n===0, j(r));

// — viewer is read-only
r = await as("viewer", `update cards set title='v' where id='a1'`); ok("viewer can't update cards", r.n===0, j(r));
r = await as("viewer", `insert into cards (id,profile_id,user_id,title,body) values ('a3','chanA',$1,'x','{}')`,[U.viewer]); ok("viewer can't insert cards", !!r.err, j(r));
r = await as("viewer", `update cards set deleted_at=now() where id='a1'`); ok("viewer can't soft-delete", r.n===0, j(r));
r = await as("viewer", `update profiles set data='{}' where id='chanA'`); ok("viewer can't update profile data", r.n===0, j(r));
r = await as("viewer", `update profile_members set role='editor' where user_id=$1`,[U.viewer]); ok("viewer can't promote self", r.n===0, j(r));

// — owner powers
r = await as("owner", `update profile_members set role='editor' where user_id=$1 and profile_id='chanA'`,[U.viewer]); ok("owner changes a role", r.n===1, j(r));
r = await as("viewer", `update cards set title='now editor' where id='a1'`); ok("promoted viewer can now edit", r.n===1, j(r));
r = await as("owner", `update profiles set name='Renamed' where id='chanA'`); r = await as("service", `select name from profiles where id='chanA'`); ok("owner can rename", r.rows[0].name==="Renamed", j(r));
r = await as("owner", `delete from profile_members where user_id=$1 and profile_id='chanA'`,[U.viewer]); ok("owner removes a member", r.n===1, j(r));
r = await as("viewer", `select id from cards`); ok("removed member loses access immediately", r.rows.length===0, j(r));

// — leave + decline
r = await as("editor", `delete from profile_members where user_id=$1 and profile_id='chanA'`,[U.editor]); ok("member can leave", r.n===1, j(r));
r = await as("editor", `select id from cards`); ok("after leaving, no access", r.rows.length===0, j(r));
r = await as("editor", `delete from profile_invites where email='viewer@x.com'`); ok("can't delete someone else's invite", r.n===0, j(r));
r = await as("editor", `delete from profile_invites where email='editor@x.com'`); ok("invitee declines own invite", r.n===1, j(r));
r = await as("owner", `delete from profile_invites where email='viewer@x.com'`); ok("owner revokes invite", r.n===1, j(r));

// — owner unchanged
r = await as("owner", `select id from cards order by id`); ok("owner still sees all own cards", j(r.rows.map(x=>x.id))===j(["a1","a2","b1"]), j(r));
r = await as("owner", `delete from profiles where id='chanB'`); ok("owner deletes own profile", r.n===1, j(r));

// — user_profiles: everyone reads, only you write yours
r = await as("editor", `insert into user_profiles (user_id,name) values ($1,'Sam')`,[U.editor]); ok("user sets own name", !r.err, r.err);
r = await as("stranger", `select name from user_profiles where user_id=$1`,[U.editor]); ok("any signed-in user can read a name", r.rows[0]?.name==="Sam", j(r));
r = await as("stranger", `insert into user_profiles (user_id,name) values ($1,'Impostor')`,[U.owner]); ok("can't create someone else's profile", !!r.err, j(r));
r = await as("stranger", `update user_profiles set name='Hacked' where user_id=$1`,[U.editor]); ok("can't rename someone else", r.n===0, j(r));
r = await as("editor", `update user_profiles set avatar='http://evil' where user_id=$1`,[U.editor]); ok("avatar must be an inline JPEG", !!r.err, j(r));

// — view_prefs: strictly your own
r = await as("editor", `insert into view_prefs (user_id,key,prefs) values ($1,'p:board','{"sort":"title"}')`,[U.editor]); ok("user saves own view prefs", !r.err, r.err);
r = await as("stranger", `select * from view_prefs`); ok("nobody else can read your view prefs", r.rows.length===0, j(r));
r = await as("stranger", `insert into view_prefs (user_id,key,prefs) values ($1,'x','{}')`,[U.editor]); ok("can't write someone else's view prefs", !!r.err, j(r));
r = await as("owner", `update view_prefs set prefs='{}' where user_id=$1`,[U.editor]); ok("even a profile owner can't change a member's views", r.n===0, j(r));

// — anon gets nothing
await db.exec(`select set_config('request.jwt.claims','',false); set role anon`);
let anonErr=null; try { await db.query(`select * from cards`);} catch(e){anonErr=e.message}
await db.exec(`reset role`); ok("anon has no table access", !!anonErr);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);

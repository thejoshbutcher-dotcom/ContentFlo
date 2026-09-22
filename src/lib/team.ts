"use client";

import { create } from "zustand";
import { useAccounts } from "./accounts";
import { getSupabaseBrowser } from "./supabase/client";

export type Role = "owner" | "editor" | "viewer";
export type MemberRole = Exclude<Role, "owner">;

export interface Member {
  userId: string;
  email: string;
  role: MemberRole;
}

export interface Invite {
  id: string;
  profileId: string;
  email: string;
  role: MemberRole;
  inviterEmail: string | null;
  profileName: string;
}

/** Someone with access to the open profile — the owner plus every member. */
export interface Person {
  userId: string;
  email: string;
  role: Role;
}

/** What a user chose to be called and look like. */
export interface Identity {
  name: string;
  /** Small JPEG data URL, or null for an initial. */
  avatar: string | null;
}

/** A teammate with this profile open right now. */
export interface Peer {
  userId: string;
  email: string;
  /** The card they have open, if any. */
  cardId: string | null;
}

interface TeamState {
  /** The signed-in user, or null in local-only mode. Set once at bootstrap —
   *  UI reads it from here rather than re-asking Supabase each time, so
   *  signed-in-only controls (Share) never flicker in late or go missing. */
  me: { id: string; email: string } | null;
  /** My role on the open profile. */
  role: Role;
  peers: Peer[];
  /** Everyone on the open profile (owner first). Empty when signed out. */
  roster: Person[];
  /** Display names and avatars, by user id, for everyone we've come across. */
  directory: Record<string, Identity>;
  /** Invites addressed to me, across all profiles. */
  incoming: Invite[];
  /** The profile whose share dialog is open. Lives here because the dialog
   *  is opened from the profile menu, which unmounts as it closes. */
  shareFor: { id: string; name: string } | null;
}

export const useTeam = create<TeamState>()(() => ({
  me: null,
  role: "owner",
  peers: [],
  roster: [],
  directory: {},
  incoming: [],
  shareFor: null,
}));

/** "sam.jones@studio.com" → "Sam.jones" — the fallback when no name is set. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/**
 * How to show someone, given their email (the key cards and notes store).
 * Their chosen name if we know it, "You" for yourself, else a name made from
 * the email. Reads the store directly, so it's usable outside React too.
 */
export function personName(email: string, me: string | null | undefined): string {
  const { roster, directory, me: self } = useTeam.getState();
  const lower = email.toLowerCase();
  if (me && lower === me.toLowerCase()) return "You";
  const id =
    roster.find((p) => p.email === lower)?.userId ??
    (self && self.email.toLowerCase() === lower ? self.id : undefined);
  const chosen = id ? directory[id]?.name.trim() : "";
  return chosen || nameFromEmail(email);
}

/** Someone's own name for themselves — never "You". */
export function ownName(userId: string, email: string): string {
  return useTeam.getState().directory[userId]?.name.trim() || nameFromEmail(email);
}

export function identityByEmail(email: string): Identity | null {
  const { roster, directory, me } = useTeam.getState();
  const lower = email.toLowerCase();
  const id =
    roster.find((p) => p.email === lower)?.userId ??
    (me && me.email.toLowerCase() === lower ? me.id : undefined);
  return id ? (directory[id] ?? null) : null;
}

interface UserProfileRow {
  user_id: string;
  name: string;
  avatar: string | null;
}

/** Fetch names/avatars for these users into the directory (tolerates the
 *  table not existing yet — then everyone just gets initials). */
export async function loadDirectory(userIds: string[]): Promise<void> {
  const supabase = getSupabaseBrowser();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!supabase || !ids.length) return;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,name,avatar")
    .in("user_id", ids);
  if (error) return;
  const next = { ...useTeam.getState().directory };
  for (const r of data as UserProfileRow[]) next[r.user_id] = { name: r.name, avatar: r.avatar };
  useTeam.setState({ directory: next });
}

/** Save my own display name / avatar. */
export async function saveMyIdentity(patch: Partial<Identity>): Promise<string | null> {
  const supabase = getSupabaseBrowser();
  const me = useTeam.getState().me;
  if (!supabase || !me) return "Sign in first.";
  const cur = useTeam.getState().directory[me.id] ?? { name: "", avatar: null };
  const next = { ...cur, ...patch };
  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: me.id, name: next.name, avatar: next.avatar, updated_at: new Date().toISOString() });
  if (error) {
    return /relation|does not exist|schema cache|could not find/i.test(error.message)
      ? "Profiles aren't switched on yet — the user_profiles migration hasn't been run."
      : error.message;
  }
  useTeam.setState({ directory: { ...useTeam.getState().directory, [me.id]: next } });
  return null;
}

/**
 * Who's on this profile: the owner (me, or whoever shared it) plus the
 * members. What the card's "Assigned to" picker offers.
 */
export async function loadRoster(profileId: string): Promise<void> {
  const me = useTeam.getState().me;
  const acct = useAccounts.getState().accounts.find((a) => a.id === profileId);
  const isOwner = (acct?.role ?? "owner") === "owner";
  const ownerEmail = isOwner ? me?.email : acct?.sharedBy;
  const ownerId = isOwner ? me?.id : acct?.ownerId;
  const roster: Person[] =
    ownerEmail && ownerId
      ? [{ userId: ownerId, email: ownerEmail.toLowerCase(), role: "owner" }]
      : [];
  const { members } = await loadTeam(profileId);
  for (const m of members) {
    if (!roster.some((p) => p.userId === m.userId)) {
      roster.push({ userId: m.userId, email: m.email.toLowerCase(), role: m.role });
    }
  }
  // The profile may have changed while we waited.
  if (useAccounts.getState().activeId === profileId) useTeam.setState({ roster });
  await loadDirectory([...roster.map((p) => p.userId), ...(me ? [me.id] : [])]);
}

/** "sam@studio.com" → "S", for presence dots. */
export function initialOf(email: string): string {
  return (email.trim()[0] ?? "?").toUpperCase();
}

export function canEdit(role: Role): boolean {
  return role !== "viewer";
}

interface InviteRow {
  id: string;
  profile_id: string;
  email: string;
  role: MemberRole;
  inviter_email: string | null;
  profile_name: string;
}

const toInvite = (r: InviteRow): Invite => ({
  id: r.id,
  profileId: r.profile_id,
  email: r.email,
  role: r.role,
  inviterEmail: r.inviter_email,
  profileName: r.profile_name,
});

/**
 * Every query here tolerates failure by returning "nothing": before the teams
 * migration has been run the tables don't exist, and the app must behave
 * exactly as it did when profiles couldn't be shared.
 */
export async function loadIncomingInvites(myEmail: string | null) {
  const supabase = getSupabaseBrowser();
  if (!supabase || !myEmail) return;
  const { data, error } = await supabase
    .from("profile_invites")
    .select("*")
    .eq("email", myEmail.toLowerCase());
  if (error) return;
  useTeam.setState({ incoming: (data as InviteRow[]).map(toInvite) });
}

export async function loadTeam(
  profileId: string
): Promise<{ members: Member[]; invites: Invite[] }> {
  const supabase = getSupabaseBrowser();
  if (!supabase) return { members: [], invites: [] };

  const [m, i] = await Promise.all([
    supabase
      .from("profile_members")
      .select("user_id,email,role")
      .eq("profile_id", profileId)
      .order("created_at"),
    supabase
      .from("profile_invites")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at"),
  ]);

  return {
    members: ((m.data ?? []) as { user_id: string; email: string; role: MemberRole }[]).map(
      (r) => ({ userId: r.user_id, email: r.email, role: r.role })
    ),
    invites: ((i.data ?? []) as InviteRow[]).map(toInvite),
  };
}

export interface InviteResult {
  ok: boolean;
  error?: string;
  /** Does the invitee already own CreatorFlo? */
  licensed?: boolean;
  /** Did an email actually go out? */
  emailed?: boolean;
}

/** Goes through the server so the inviter, email and name can't be forged. */
export async function sendInvite(
  profileId: string,
  email: string,
  role: MemberRole
): Promise<InviteResult> {
  try {
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, email, role }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error ?? "Couldn't send that invite." };
    return { ok: true, licensed: body.licensed, emailed: body.emailed };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

/** Server-side too: it re-checks the licence before granting access. */
export async function acceptInvite(
  inviteId: string
): Promise<{ ok: boolean; error?: string; profileId?: string }> {
  try {
    const res = await fetch("/api/team/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error ?? "Couldn't accept that invite." };
    useTeam.setState((s) => ({ incoming: s.incoming.filter((i) => i.id !== inviteId) }));
    return { ok: true, profileId: body.profileId };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

/** Decline (as invitee) or revoke (as owner) — RLS allows exactly those two. */
export async function deleteInvite(inviteId: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  await supabase.from("profile_invites").delete().eq("id", inviteId);
  useTeam.setState((s) => ({ incoming: s.incoming.filter((i) => i.id !== inviteId) }));
}

export async function setMemberRole(profileId: string, userId: string, role: MemberRole) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  await supabase
    .from("profile_members")
    .update({ role })
    .eq("profile_id", profileId)
    .eq("user_id", userId);
}

export async function removeMember(profileId: string, userId: string) {
  const supabase = getSupabaseBrowser();
  if (!supabase) return;
  await supabase
    .from("profile_members")
    .delete()
    .eq("profile_id", profileId)
    .eq("user_id", userId);
}

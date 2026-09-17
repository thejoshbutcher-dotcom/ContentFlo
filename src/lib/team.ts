"use client";

import { create } from "zustand";
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
  incoming: [],
  shareFor: null,
}));

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

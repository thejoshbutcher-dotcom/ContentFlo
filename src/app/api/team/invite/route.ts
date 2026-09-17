import { NextResponse, type NextRequest } from "next/server";
import { hasPurchase } from "@/lib/entitlement";
import { inviteEmail } from "@/lib/invite-email";
import { sendMail } from "@/lib/mailer";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Enough for any real team; a ceiling on using invites to send bulk email. */
const MAX_PENDING_PER_PROFILE = 25;

/**
 * Invite someone to a profile, by email.
 *
 * Runs on the server (not as a client insert) so the inviter, their email and
 * the profile name are taken from the session and the database — none of it
 * can be forged — and so the invitee's licence can be looked up, which no
 * signed-in user is allowed to read.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { profileId?: unknown; email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role === "viewer" ? "viewer" : body.role === "editor" ? "editor" : null;

  if (!profileId || !role) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (email === user.email.toLowerCase()) {
    return NextResponse.json({ error: "That's you — you already own this profile." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sharing isn't configured yet." }, { status: 503 });
  }

  // Only a paying customer can invite, and only to a profile they own.
  if (!(await hasPurchase(user.email))) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("id,user_id,name")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile || profile.user_id !== user.id) {
    return NextResponse.json({ error: "Only the owner can share this profile." }, { status: 403 });
  }

  const { data: existing } = await admin
    .from("profile_members")
    .select("user_id")
    .eq("profile_id", profileId)
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "They're already on this profile." }, { status: 409 });
  }

  const { data: pending, error: pendErr } = await admin
    .from("profile_invites")
    .select("id,email")
    .eq("profile_id", profileId);
  if (pendErr) {
    // Most likely the teams migration hasn't been run on this database.
    console.error("[team/invite] invites unavailable", pendErr);
    return NextResponse.json({ error: "Sharing isn't switched on yet." }, { status: 503 });
  }
  const already = pending?.some((p) => p.email === email);
  if (!already && (pending?.length ?? 0) >= MAX_PENDING_PER_PROFILE) {
    return NextResponse.json(
      { error: "Too many pending invites — revoke some first." },
      { status: 429 }
    );
  }

  const { error: insErr } = await admin.from("profile_invites").upsert(
    {
      profile_id: profileId,
      email,
      role,
      invited_by: user.id,
      inviter_email: user.email,
      profile_name: profile.name,
    },
    { onConflict: "profile_id,email" }
  );
  if (insErr) {
    console.error("[team/invite] insert failed", insErr);
    return NextResponse.json({ error: "Couldn't create that invite." }, { status: 500 });
  }

  const licensed = await hasPurchase(email);

  // Re-inviting the same address only updates the role; don't email twice.
  let emailed = false;
  if (!already) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
    emailed = await sendMail({
      to: email,
      replyTo: user.email,
      ...inviteEmail({
        inviterEmail: user.email,
        profileName: profile.name,
        role,
        licensed,
        origin,
      }),
    });
  }

  return NextResponse.json({ ok: true, licensed, emailed });
}

import { NextResponse, type NextRequest } from "next/server";
import { hasPurchase } from "@/lib/entitlement";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Turn an invite into a membership.
 *
 * This is the ONLY way a membership row is ever created — `profile_members`
 * has no insert policy — so it is also the licence gate for shared content:
 * the page-level purchase check protects the app's UI, but the database is
 * reachable directly with any signed-in session, so access has to be refused
 * here, where the row would be made.
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let inviteId = "";
  try {
    ({ inviteId } = await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof inviteId !== "string" || !inviteId) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!(await hasPurchase(user.email))) {
    return NextResponse.json(
      { error: "You need your own copy of CreatorFlo to join a shared profile." },
      { status: 402 }
    );
  }

  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Sharing isn't configured yet." }, { status: 503 });
  }

  // Matched on the SESSION's email, never one from the request: an invite is
  // only redeemable by the address it was sent to.
  const { data: invite } = await admin
    .from("profile_invites")
    .select("*")
    .eq("id", inviteId)
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!invite) {
    return NextResponse.json(
      { error: "That invite is no longer available." },
      { status: 404 }
    );
  }

  const { error: memErr } = await admin.from("profile_members").upsert(
    {
      profile_id: invite.profile_id,
      user_id: user.id,
      role: invite.role,
      email: user.email.toLowerCase(),
      inviter_email: invite.inviter_email,
    },
    { onConflict: "profile_id,user_id" }
  );
  if (memErr) {
    console.error("[team/accept] membership failed", memErr);
    return NextResponse.json({ error: "Couldn't join that profile." }, { status: 500 });
  }

  await admin.from("profile_invites").delete().eq("id", invite.id);

  return NextResponse.json({ ok: true, profileId: invite.profile_id, role: invite.role });
}

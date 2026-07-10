import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Magic-link landing route. Supabase emails a `token_hash` which we exchange
 * for a session; the SSR client writes the auth cookies onto the response.
 *
 * Set the Supabase "Magic Link" email template to:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const failed = new URL("/login", origin);

  if (!tokenHash || !type) {
    failed.searchParams.set("error", "Invalid sign-in link.");
    return NextResponse.redirect(failed);
  }

  const supabase = await createSupabaseServer();
  if (!supabase) {
    failed.searchParams.set("error", "Sign-in isn't configured.");
    return NextResponse.redirect(failed);
  }

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    failed.searchParams.set("error", "That link expired. Request a new one.");
    return NextResponse.redirect(failed);
  }

  // `next` comes from our own redirect param; keep it relative to block
  // open-redirects to another origin.
  const dest = next.startsWith("/") ? next : "/";
  return NextResponse.redirect(new URL(dest, origin));
}

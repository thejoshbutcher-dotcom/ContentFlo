import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Magic-link landing route. Handles both shapes Supabase can send:
 *
 *  1. `?code=...` — the PKCE flow used by the DEFAULT email template. Supabase's
 *     /auth/v1/verify endpoint redirects here with a code, which we swap for a
 *     session. The code_verifier was stored in a cookie by the browser client.
 *     This is the path that works with no custom SMTP, since Supabase only lets
 *     you edit email templates once you've configured your own SMTP server.
 *
 *  2. `?token_hash=...&type=...` — used if the Magic Link template is customised
 *     to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
 *
 * Supporting both means sign-in works out of the box and keeps working if a
 * custom template is added later.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // Behind a reverse proxy (Hostinger/LiteSpeed) request.nextUrl.origin resolves to
  // the internal bind address (0.0.0.0:3000), which breaks the post-verify redirect.
  // Prefer the configured public site URL, same as the checkout route.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const fail = (reason: string) => {
    const url = new URL("/login", origin);
    url.searchParams.set("error", reason);
    return NextResponse.redirect(url);
  };

  const supabase = await createSupabaseServer();
  if (!supabase) return fail("Sign-in isn't configured.");

  let error = null;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else {
    return fail("Invalid sign-in link.");
  }

  if (error) return fail("That link expired or was already used. Request a new one.");

  // `next` is our own param, but keep it relative so a crafted link can't
  // turn this into an open redirect.
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(new URL(dest, origin));
}

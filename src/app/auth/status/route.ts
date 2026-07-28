import { NextResponse } from "next/server";
import { isAuthEnabled, isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Diagnostic: reports what the server sees for the current request's cookies.
 * Exercises the `authenticated` grants and RLS with a real session, which no
 * anon-key curl can do. Safe to expose: it only ever reports the caller's own
 * state, and RLS scopes every count to their own rows.
 */
export async function GET() {
  const report: Record<string, unknown> = {
    supabaseConfigured: isSupabaseConfigured(),
    loginWallEnabled: isAuthEnabled(),
    // Raw value so a missing/misspelled env var is obvious. NOTE: this is the
    // *runtime* value; the login button uses the value inlined at BUILD time,
    // so if this says "true" but no button shows, the app needs a rebuild.
    googleAuthEnvRaw: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH ?? null,
  };

  const supabase = await createSupabaseServer();
  if (!supabase) {
    report.error = "Supabase not configured";
    return NextResponse.json(report, { status: 200 });
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  report.signedIn = Boolean(user);
  report.userId = user?.id ?? null;
  report.email = user?.email ?? null;
  if (userErr) report.authError = userErr.message;

  if (!user) {
    report.hint =
      "No session cookie. The magic link must be requested and opened in the SAME browser.";
    return NextResponse.json(report, { status: 200 });
  }

  // These prove the `authenticated` grants + RLS actually work.
  const { count: profileCount, error: pErr } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });
  report.cloudProfiles = pErr ? `ERROR: ${pErr.message}` : profileCount;

  const { count: cardCount, error: cErr } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true });
  report.cloudCards = cErr ? `ERROR: ${cErr.message}` : cardCount;

  return NextResponse.json(report, { status: 200 });
}

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  if (supabase) await supabase.auth.signOut();
  // Prefer the public site URL: behind a proxy request.nextUrl.origin is the
  // internal bind address (0.0.0.0:3000). See auth/confirm/route.ts.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  return NextResponse.redirect(new URL("/login", origin), {
    status: 303,
  });
}

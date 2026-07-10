import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/session";

// Next 16 renamed the `middleware` file convention to `proxy`.
export async function proxy(request: NextRequest) {
  // No backend wired up yet — leave the local-only app untouched.
  if (!isSupabaseConfigured()) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and the Stripe webhook, which arrives
     * unauthenticated and verifies itself by signature.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|brand/|api/stripe/webhook|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};

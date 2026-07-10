import { NextResponse, type NextRequest } from "next/server";
import { isAuthEnabled } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/session";

// Next 16 renamed the `middleware` file convention to `proxy`.
export async function proxy(request: NextRequest) {
  // Login wall stays off until NEXT_PUBLIC_ENABLE_AUTH=true, even once a
  // Supabase project is configured.
  if (!isAuthEnabled()) return NextResponse.next();
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

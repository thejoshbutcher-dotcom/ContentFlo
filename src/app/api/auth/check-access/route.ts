import { NextResponse, type NextRequest } from "next/server";
import { hasPurchase } from "@/lib/entitlement";

export const runtime = "nodejs";

/**
 * Does this email own CreatorFlo? Called by /login before sending a magic link,
 * so a buyer isn't emailed a link to an app they can't open.
 *
 * This is only a UX guard, not the gate. A determined caller can skip it and
 * ask Supabase for a link directly. The real gate is the server-side purchase
 * check in `src/app/page.tsx`, which no client can bypass.
 */
export async function POST(request: NextRequest) {
  let email = "";
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  return NextResponse.json({ hasAccess: await hasPurchase(email) });
}

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Instant sign-in for testing — skips the magic-link email.
 *
 * THREE independent locks, all required:
 *   1. Never runs in a production build (NODE_ENV check).
 *   2. The email must be in the DEV_LOGIN_EMAILS allowlist.
 *   3. Needs the service-role key, which is server-only.
 *
 * It doesn't invent a session — it uses the admin API to generate a real
 * magic-link token and verifies it server-side, so the cookie is issued by
 * the exact same Supabase flow a real sign-in uses.
 */
export async function POST(request: NextRequest) {
  // Lock 1: dead code in production.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allow = (process.env.DEV_LOGIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  let email = "";
  try {
    ({ email } = await request.json());
  } catch {
    /* fall through to the allowlist check */
  }
  const target = (email || "").trim().toLowerCase();

  // Lock 2: allowlist.
  if (!target || !allow.includes(target)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  // Lock 3: service role.
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  // Create the user if this is their first sign-in.
  await admin.auth.admin.createUser({ email: target, email_confirm: true });

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: target,
  });
  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create session" },
      { status: 500 }
    );
  }

  const supabase = await createSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (verifyErr) {
    return NextResponse.json({ error: verifyErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

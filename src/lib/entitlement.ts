import "server-only";

import { createSupabaseAdmin } from "./supabase/admin";

/** Emails granted access without a purchase (owner / comp accounts). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && adminEmails().includes(email!.trim().toLowerCase());
}

/**
 * Has this email address bought CreatorFlo?
 *
 * Purchases are keyed by email because the buyer has no account yet when the
 * Stripe webhook fires. Matching is case-insensitive: Stripe returns whatever
 * the buyer typed at checkout.
 *
 * Read with the service role. The `purchases` table has no policies and no
 * grants to `authenticated`, so a signed-in user can neither read nor forge it.
 */
export async function hasPurchase(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;

  // Owner / comp accounts are always in.
  if (isAdminEmail(email)) return true;

  const admin = createSupabaseAdmin();
  // Fail closed. If the server is misconfigured, nobody gets in.
  if (!admin) return false;

  const { data, error } = await admin
    .from("purchases")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .eq("status", "active")
    .limit(1);

  if (error) {
    console.error("[entitlement] purchase lookup failed", error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

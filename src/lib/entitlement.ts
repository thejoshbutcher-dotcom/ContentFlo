import "server-only";

import { createSupabaseAdmin } from "./supabase/admin";

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

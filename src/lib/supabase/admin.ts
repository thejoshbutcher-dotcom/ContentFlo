import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/**
 * Service-role client. Bypasses RLS entirely — SERVER ONLY.
 *
 * Never import this from a client component. The key has no NEXT_PUBLIC_ prefix
 * so Next will refuse to inline it into the browser bundle, but the import
 * itself would still leak the module graph.
 */
export function createSupabaseAdmin(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

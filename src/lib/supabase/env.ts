export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Whether a Supabase project is reachable. Gates client construction. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Whether to actually gate the app behind sign-in.
 *
 * Kept separate from `isSupabaseConfigured` on purpose: it lets us build and
 * test the sync engine against a live project while the app still runs on
 * localStorage, and flip the login wall on only once the cloud migration is
 * ready. Set NEXT_PUBLIC_ENABLE_AUTH=true to turn it on.
 */
export function isAuthEnabled(): boolean {
  return isSupabaseConfigured() && process.env.NEXT_PUBLIC_ENABLE_AUTH === "true";
}

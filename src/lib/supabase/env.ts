export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Whether a Supabase project is reachable. Gates client construction. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Whether to gate the app behind sign-in.
 *
 * Fail-secure: once a Supabase backend is configured, the login wall is ON by
 * default. A deployment with the keys set is therefore protected even if the
 * flag is forgotten. Set NEXT_PUBLIC_ENABLE_AUTH=false to explicitly turn it
 * off for local development (the app then runs on localStorage only).
 */
export function isAuthEnabled(): boolean {
  return (
    isSupabaseConfigured() && process.env.NEXT_PUBLIC_ENABLE_AUTH !== "false"
  );
}

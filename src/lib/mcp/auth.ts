import "server-only";

import { createClient } from "@supabase/supabase-js";
import { hasPurchase } from "../entitlement";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../supabase/env";
import type { McpContext } from "./cards";

/** Public origin (behind Hostinger's proxy the request origin is internal). */
export function publicOrigin(req: Request): string {
  if (process.env.NODE_ENV === "development") return new URL(req.url).origin;
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
}

export function resourceMetadataUrl(req: Request): string {
  return `${publicOrigin(req)}/.well-known/oauth-protected-resource`;
}

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

function challenge(req: Request, status: number, error?: string, description?: string): Response {
  const parts = [`Bearer resource_metadata="${resourceMetadataUrl(req)}"`];
  if (error) parts.push(`error="${error}"`);
  if (description) parts.push(`error_description="${description}"`);
  return new Response(
    JSON.stringify({ error: error ?? "unauthorized", error_description: description ?? "Sign in to CreatorFlo." }),
    {
      status,
      headers: { ...CORS, "Content-Type": "application/json", "WWW-Authenticate": parts.join(", ") },
    }
  );
}

/**
 * Who is calling. The bearer token is a Supabase user access token (issued by
 * Supabase's OAuth 2.1 server when someone connects Claude, or a normal
 * session token). Supabase verifies it; the returned client carries it, so
 * RLS applies to everything the tools do.
 *
 * The admin key is used for exactly one thing: the licence lookup, which no
 * user can read (same as the app's own gate). It never decides data access.
 */
export async function authenticate(req: Request): Promise<McpContext | Response> {
  const header = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
  if (!token) return challenge(req, 401);

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    return challenge(req, 401, "invalid_token", "Your CreatorFlo sign-in expired. Reconnect to sign in again.");
  }
  const email = data.user.email ?? "";
  if (!(await hasPurchase(email))) {
    return new Response(
      JSON.stringify({
        error: "insufficient_scope",
        error_description: `${email || "This account"} doesn't have a CreatorFlo licence.`,
      }),
      { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
  return { db, userId: data.user.id, email };
}

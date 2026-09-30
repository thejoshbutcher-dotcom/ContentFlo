import { CORS } from "@/lib/mcp/auth";
import { SUPABASE_URL } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * Supabase Auth's OAuth 2.1 server metadata, mirrored on creatorflo.io for
 * older MCP clients that look for it on the resource's own host. Current
 * clients follow the protected-resource metadata straight to Supabase.
 */
export async function GET() {
  const res = await fetch(`${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`, {
    next: { revalidate: 3600 },
  }).catch(() => null);
  if (!res || !res.ok) {
    return Response.json(
      { error: "temporarily_unavailable", error_description: "Sign-in isn't available right now." },
      { status: 503, headers: CORS }
    );
  }
  return new Response(await res.text(), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

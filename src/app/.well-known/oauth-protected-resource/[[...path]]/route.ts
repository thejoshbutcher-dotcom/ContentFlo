import { CORS, publicOrigin } from "@/lib/mcp/auth";
import { SUPABASE_URL } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 protected-resource metadata for /api/mcp. Tells MCP clients that
 * sign-in is handled by Supabase Auth's OAuth 2.1 server. Served at both
 * /.well-known/oauth-protected-resource and …/api/mcp (clients try either).
 */
export function GET(req: Request) {
  const origin = publicOrigin(req);
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
      resource_name: "CreatorFlo",
      resource_documentation: `${origin}/login`,
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } }
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

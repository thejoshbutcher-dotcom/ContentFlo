import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate, CORS } from "@/lib/mcp/auth";
import { buildServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CreatorFlo's MCP server — https://creatorflo.io/api/mcp.
 *
 * Streamable HTTP in STATELESS mode with plain JSON responses: every POST is
 * handled start to finish on its own, with no session and no long-lived
 * stream for a shared-hosting proxy to cut. Each request gets a fresh server
 * whose tools act as the signed-in user.
 */
async function handle(req: Request): Promise<Response> {
  const ctx = await authenticate(req);
  if (ctx instanceof Response) return ctx;

  const server = buildServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  } finally {
    // Stateless: nothing to keep once the response is built.
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

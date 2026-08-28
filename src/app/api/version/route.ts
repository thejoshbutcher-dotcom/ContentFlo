import { NextResponse } from "next/server";

/**
 * Which build is serving. Public on purpose: it exists so a deploy can be
 * verified by hitting the live site directly — no Hostinger dashboard or
 * connector auth involved — and it also catches "build succeeded but the
 * server is still serving stale code". Exposes nothing but a commit id and
 * a timestamp.
 */
export async function GET() {
  return NextResponse.json({
    commit: process.env.BUILD_COMMIT || null,
    builtAt: process.env.BUILD_TIME || null,
  });
}

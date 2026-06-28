import { NextRequest, NextResponse } from "next/server";

/**
 * Local API trust boundary.
 *
 * Cockpit serves powerful routes on localhost — execute actions, configure
 * MCP subprocesses, mutate agents, send messages through connected SaaS
 * accounts. Because any page in any browser can issue requests to localhost,
 * a malicious website could otherwise drive those mutations (CSRF).
 *
 * This middleware rejects cross-origin state-changing requests. Packaged
 * Electron builds additionally set COCKPIT_API_TOKEN, which gates local API
 * access with a per-session cookie/header so arbitrary same-user local
 * processes cannot drive the app through localhost unless they know that
 * session token.
 *
 * The browser sets `Sec-Fetch-Site` (and `Origin`) and JavaScript cannot forge
 * them, so:
 *
 *   - same-origin / user-initiated (our renderer)      → allowed
 *   - cross-site / same-site (another website's fetch) → rejected
 *   - no browser headers and no packaged token gate
 *     (dev Electron polling, local tooling)            → allowed
 *
 * When COCKPIT_API_TOKEN is absent (browser dev / next dev), only the
 * browser-origin protection is applied. OAuth callbacks stay exempt from the
 * token gate because providers redirect an external browser to those GET
 * endpoints; they remain protected by their own OAuth state validation.
 */

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const API_TOKEN_COOKIE = "cockpit_api_token";
const API_TOKEN_HEADER = "x-cockpit-token";
const OAUTH_CALLBACK_PATHS = new Set([
  "/api/datasources/callback",
  "/api/datasources/mcp/callback",
]);

function blocked(message = "Cross-origin request blocked") {
  return new NextResponse(
    JSON.stringify({ error: message }),
    { status: 403, headers: { "content-type": "application/json" } }
  );
}

function hasValidApiToken(req: NextRequest, expected: string): boolean {
  const headerToken = req.headers.get(API_TOKEN_HEADER);
  const cookieToken = req.cookies.get(API_TOKEN_COOKIE)?.value;
  return headerToken === expected || cookieToken === expected;
}

export function middleware(req: NextRequest) {
  const apiToken = process.env.COCKPIT_API_TOKEN;
  if (
    apiToken &&
    !OAUTH_CALLBACK_PATHS.has(req.nextUrl.pathname) &&
    !hasValidApiToken(req, apiToken)
  ) {
    return blocked("Unauthorized local API request");
  }

  if (!UNSAFE_METHODS.has(req.method)) {
    return NextResponse.next();
  }

  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite) {
    // Unspoofable browser signal. Only our own renderer (same-origin) or a
    // user-initiated navigation (none) may mutate.
    if (secFetchSite === "same-origin" || secFetchSite === "none") {
      return NextResponse.next();
    }
    return blocked();
  }

  // No Sec-Fetch-Site: older browser, or a non-browser client. Fall back to
  // Origin — if present it must match Host; if absent it's a non-browser
  // caller (Electron's Node polling, curl) which the web threat can't produce.
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get("host")) return blocked();
    } catch {
      return blocked();
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

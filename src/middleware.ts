import { NextRequest, NextResponse } from "next/server";

/**
 * Local API trust boundary.
 *
 * Cockpit serves powerful routes on localhost — execute actions, configure
 * MCP subprocesses, mutate agents, send messages through connected SaaS
 * accounts. Because any page in any browser can issue requests to localhost,
 * a malicious website could otherwise drive those mutations (CSRF).
 *
 * This middleware rejects cross-origin state-changing requests. The browser
 * sets `Sec-Fetch-Site` (and `Origin`) and JavaScript cannot forge them, so:
 *
 *   - same-origin / user-initiated (our renderer)      → allowed
 *   - cross-site / same-site (another website's fetch) → rejected
 *   - no browser headers at all (Electron's own Node
 *     polling, curl, local tooling)                    → allowed
 *
 * Only unsafe methods are guarded. GET stays open: the browser's same-origin
 * policy already prevents a cross-site page from reading our responses, the
 * OAuth provider redirect lands on a GET callback (protected separately by its
 * CSRF `state` param), and Electron's background polling is GET.
 *
 * Note: this stops the browser-based threat. A separate per-session token
 * (Electron-injected) would additionally gate non-browser local processes —
 * see the security PR notes. It's deferred because a same-user local process
 * can already read ~/.cockpit token files directly, so the marginal gain
 * didn't justify shipping unverifiable Electron/renderer plumbing.
 */

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function blocked() {
  return new NextResponse(
    JSON.stringify({ error: "Cross-origin request blocked" }),
    { status: 403, headers: { "content-type": "application/json" } }
  );
}

export function middleware(req: NextRequest) {
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

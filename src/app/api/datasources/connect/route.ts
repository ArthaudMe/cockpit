import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthUrl } from "@/lib/datasources/manager";
import { createComposioOAuthState, createOAuthState, enableService } from "@/lib/datasources/token-store";
import type { ServiceId } from "@/lib/datasources/types";
import { isComposioEnabled, createConnectLink, isAllowedComposioRedirectUrl } from "@/lib/datasources/composio";
import { isProxyEnabled, proxyPreflight } from "@/lib/datasources/oauth-proxy";

const OAUTH_SERVICES: ServiceId[] = [
  "google",
  "linear",
  "github",
  "notion",
  "slack",
];

// Auto-detected services just need to be re-enabled
const AUTO_DETECTED: ServiceId[] = ["granola"];

// Always use localhost callback — the local Next.js server handles it directly.
// This avoids custom-scheme issues (Google blocks cockpit://, Slack needs PKCE, etc.)
function getRedirectUri(origin: string): string {
  return `${origin}/api/datasources/callback`;
}

// Services that require PKCE (Slack requires it for localhost redirect URIs)
const PKCE_SERVICES: ServiceId[] = ["slack"];

const DIRECT_SECRET_ENV: Partial<Record<ServiceId, string>> = {
  google: "GOOGLE_CLIENT_SECRET",
  linear: "LINEAR_CLIENT_SECRET",
  github: "GITHUB_CLIENT_SECRET",
  notion: "NOTION_CLIENT_SECRET",
  slack: "SLACK_CLIENT_SECRET",
};

function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

async function assertOAuthReady(service: ServiceId): Promise<void> {
  if (isProxyEnabled()) {
    await proxyPreflight(service);
    return;
  }

  const secretEnv = DIRECT_SECRET_ENV[service];
  if (!secretEnv || process.env[secretEnv]) return;

  throw new Error(
    `OAuth is not configured for ${service}. Rebuild Cockpit with OAUTH_PROXY_URL and OAUTH_PROXY_SECRET, or set ${secretEnv} for local development.`
  );
}

export async function GET(req: NextRequest) {
  const service = req.nextUrl.searchParams.get("service") as ServiceId | null;

  if (!service || ![...OAUTH_SERVICES, ...AUTO_DETECTED].includes(service)) {
    return NextResponse.json(
      { error: "Invalid service" },
      { status: 400 }
    );
  }

  // Auto-detected services: just re-enable, no OAuth needed
  if (AUTO_DETECTED.includes(service)) {
    enableService(service);
    return NextResponse.json({ reconnected: true });
  }

  const origin = req.nextUrl.origin;
  const redirectUri = getRedirectUri(origin);

  // Google via Composio — managed OAuth, no CASA verification needed
  if (service === "google" && isComposioEnabled()) {
    try {
      // Chain: connect Calendar first, then Gmail.
      // The callback handler will chain the Gmail connect automatically.
      const state = crypto.randomUUID();
      const callbackUrl = `${origin}/api/datasources/callback?composio=googlecalendar&state=${encodeURIComponent(state)}`;
      const link = await createConnectLink("googlecalendar", callbackUrl);
      createComposioOAuthState("googlecalendar", link.connectionId, state);
      if (!isAllowedComposioRedirectUrl(link.redirectUrl)) {
        throw new Error("Unexpected Composio redirect URL");
      }
      return NextResponse.json({ url: link.redirectUrl, redirectUri });
    } catch (err) {
      console.error("[Composio connect]", err);
      return NextResponse.json(
        { error: "Failed to create Composio connect link" },
        { status: 500 },
      );
    }
  }

  try {
    await assertOAuthReady(service);
  } catch (err) {
    console.error("[OAuth preflight]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OAuth is not configured" },
      { status: 503 },
    );
  }

  // Generate PKCE for services that require it
  const needsPKCE = PKCE_SERVICES.includes(service);
  const pkce = needsPKCE ? generatePKCE() : undefined;
  const state = createOAuthState(service, pkce?.codeVerifier);

  const authUrl = getAuthUrl(service, redirectUri, state, pkce?.codeChallenge);

  return NextResponse.json({ url: authUrl, redirectUri });
}

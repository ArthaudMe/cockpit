import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthUrl } from "@/lib/datasources/manager";
import { createOAuthState, enableService } from "@/lib/datasources/token-store";
import type { ServiceId } from "@/lib/datasources/types";
import { isComposioEnabled, createConnectLink } from "@/lib/datasources/composio";

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

function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
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
      const callbackUrl = `${origin}/api/datasources/callback?composio=googlecalendar`;
      const link = await createConnectLink("googlecalendar", callbackUrl);
      return NextResponse.json({ url: link.redirectUrl, redirectUri });
    } catch (err) {
      console.error("[Composio connect]", err);
      return NextResponse.json(
        { error: "Failed to create Composio connect link" },
        { status: 500 },
      );
    }
  }

  // Generate PKCE for services that require it
  const needsPKCE = PKCE_SERVICES.includes(service);
  const pkce = needsPKCE ? generatePKCE() : undefined;
  const state = createOAuthState(service, pkce?.codeVerifier);

  const authUrl = getAuthUrl(service, redirectUri, state, pkce?.codeChallenge);

  return NextResponse.json({ url: authUrl, redirectUri });
}

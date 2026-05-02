import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/datasources/manager";
import { createOAuthState, enableService } from "@/lib/datasources/token-store";
import type { ServiceId } from "@/lib/datasources/types";

const OAUTH_SERVICES: ServiceId[] = [
  "google",
  "linear",
  "github",
  "notion",
  "slack",
];

// Auto-detected services just need to be re-enabled
const AUTO_DETECTED: ServiceId[] = ["granola"];

const PROXY_URL = process.env.OAUTH_PROXY_URL || "https://proxy-mio-xyz.vercel.app";

// In production, redirect through the hosted proxy which bounces to cockpit:// deep link.
// In dev, redirect to localhost directly.
function getRedirectUri(origin: string, service: ServiceId): string {
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    // Slack requires HTTPS redirect URIs
    if (service === "slack") {
      return `https://localhost:3939/api/datasources/callback`;
    }
    return `${origin}/api/datasources/callback`;
  }
  // Production: HTTPS redirect accepted by all providers, bounces to cockpit://
  return `${PROXY_URL}/api/oauth/redirect`;
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
  const redirectUri = getRedirectUri(origin, service);
  const state = createOAuthState(service);

  const authUrl = getAuthUrl(service, redirectUri, state);

  return NextResponse.json({ url: authUrl, redirectUri });
}

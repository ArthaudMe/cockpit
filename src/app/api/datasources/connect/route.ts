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

// Always use localhost callback — the local Next.js server handles it directly.
// This avoids custom-scheme issues (Google blocks cockpit://, Slack needs PKCE, etc.)
function getRedirectUri(origin: string): string {
  return `${origin}/api/datasources/callback`;
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
  const state = createOAuthState(service);

  const authUrl = getAuthUrl(service, redirectUri, state);

  return NextResponse.json({ url: authUrl, redirectUri });
}

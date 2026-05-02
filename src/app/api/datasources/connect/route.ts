import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/datasources/manager";
import { createOAuthState } from "@/lib/datasources/token-store";
import type { ServiceId } from "@/lib/datasources/types";

const VALID_SERVICES: ServiceId[] = [
  "google",
  "linear",
  "github",
  "notion",
  "slack",
];

// Always use localhost callback — the local Next.js server handles it directly.
// This avoids custom-scheme issues (Google blocks cockpit://, Slack needs PKCE, etc.)
function getRedirectUri(origin: string, _service: ServiceId): string {
  return `${origin}/api/datasources/callback`;
}

export async function GET(req: NextRequest) {
  const service = req.nextUrl.searchParams.get("service") as ServiceId | null;

  if (!service || !VALID_SERVICES.includes(service)) {
    return NextResponse.json(
      { error: "Invalid service. Must be one of: " + VALID_SERVICES.join(", ") },
      { status: 400 }
    );
  }

  const origin = req.nextUrl.origin;
  const redirectUri = getRedirectUri(origin, service);
  const state = createOAuthState(service);

  const authUrl = getAuthUrl(service, redirectUri, state);

  return NextResponse.json({ url: authUrl, redirectUri });
}

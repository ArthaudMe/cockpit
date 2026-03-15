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

// In production Electron, use deep link protocol.
// In dev, use localhost callback directly.
function getRedirectUri(origin: string, service: ServiceId): string {
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    // Slack requires HTTPS redirect URIs
    if (service === "slack") {
      return `https://localhost:3000/api/datasources/callback`;
    }
    return `${origin}/api/datasources/callback`;
  }
  return "cockpit://oauth/callback";
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

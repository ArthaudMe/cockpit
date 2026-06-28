import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthUrl } from "@/lib/datasources/manager";
import { createComposioOAuthState, createOAuthState, enableService } from "@/lib/datasources/token-store";
import type { ServiceId } from "@/lib/datasources/types";
import { isComposioEnabled, createConnectLink, isAllowedComposioRedirectUrl } from "@/lib/datasources/composio";
import { assertProxyClientId, isProxyEnabled, proxyPreflight } from "@/lib/datasources/oauth-proxy";
import CREDENTIALS from "@/lib/datasources/credentials";
import { clearDatasourceDataCache } from "@/lib/datasources/manager";
import { ensurePresetMcpServer } from "@/lib/datasources/mcp-store";
import { startMcpAuthorization } from "@/lib/datasources/mcp-oauth";

const OAUTH_SERVICES: ServiceId[] = [
  "google",
  "linear",
  "github",
  "notion",
  "slack",
];

const MCP_PRESET_SERVICES: ServiceId[] = ["granola", "attio"];

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

const PUBLIC_CLIENT_IDS: Partial<Record<ServiceId, string>> = {
  google: CREDENTIALS.GOOGLE_CLIENT_ID,
  linear: CREDENTIALS.LINEAR_CLIENT_ID,
  github: CREDENTIALS.GITHUB_CLIENT_ID,
  notion: CREDENTIALS.NOTION_CLIENT_ID,
  slack: CREDENTIALS.SLACK_CLIENT_ID,
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
  if (service === "google") {
    throw new Error(
      "Google Calendar/Gmail must connect through Composio. This build is missing COMPOSIO_API_KEY, COMPOSIO_GCAL_AUTH_CONFIG, or COMPOSIO_GMAIL_AUTH_CONFIG."
    );
  }

  if (isProxyEnabled()) {
    const clientId = PUBLIC_CLIENT_IDS[service];
    if (clientId) {
      await assertProxyClientId(service, clientId);
    }
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

  if (!service || ![...OAUTH_SERVICES, ...MCP_PRESET_SERVICES].includes(service)) {
    return NextResponse.json(
      { error: "Invalid service" },
      { status: 400 }
    );
  }

  if (MCP_PRESET_SERVICES.includes(service)) {
    const preset = service === "attio" ? "attio" : "granola";
    const server = ensurePresetMcpServer(preset);
    const redirectUri = `${req.nextUrl.origin}/api/datasources/mcp/callback`;
    let result: Awaited<ReturnType<typeof startMcpAuthorization>>;
    try {
      result = await startMcpAuthorization(server, redirectUri);
    } catch (err) {
      console.error("[MCP OAuth preflight]", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Couldn't start MCP authorization." },
        { status: 503 },
      );
    }

    if (!result.authorized) {
      return NextResponse.json({
        url: result.url,
        redirectUri,
        mcp: {
          id: server.id,
          name: server.name,
          url: server.url,
          transport: server.transport,
        },
      });
    }

    enableService(service);
    clearDatasourceDataCache();
    return NextResponse.json({
      reconnected: true,
      mcp: {
        id: server.id,
        name: server.name,
        url: server.url,
        transport: server.transport,
      },
      message: `${server.name} MCP connected.`,
    });
  }

  const origin = req.nextUrl.origin;
  const redirectUri = getRedirectUri(origin);

  // Google via Composio — managed OAuth, no Google verification screen.
  // Fail closed when Composio is absent so packaged builds cannot fall back to
  // the direct Google OAuth client.
  if (service === "google") {
    if (!isComposioEnabled()) {
      return NextResponse.json(
        {
          error:
            "Google Calendar/Gmail must connect through Composio. This build is missing COMPOSIO_API_KEY, COMPOSIO_GCAL_AUTH_CONFIG, or COMPOSIO_GMAIL_AUTH_CONFIG.",
        },
        { status: 503 },
      );
    }

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

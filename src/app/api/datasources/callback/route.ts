import { NextRequest, NextResponse } from "next/server";
import { consumeOAuthState, saveTokens } from "@/lib/datasources/token-store";
import { exchangeCode } from "@/lib/datasources/manager";
import type { ServiceId } from "@/lib/datasources/types";

const PROXY_URL = process.env.OAUTH_PROXY_URL || "https://proxy-mio-xyz.vercel.app";

function getRedirectUri(origin: string, service: ServiceId): string {
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    // Slack requires HTTPS redirect URIs — must match connect route
    if (service === "slack") {
      return `https://localhost:3939/api/datasources/callback`;
    }
    return `${origin}/api/datasources/callback`;
  }
  // Must match the redirect_uri used in the authorize request
  return `${PROXY_URL}/api/oauth/redirect`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return new NextResponse(renderHTML("Connection failed", error, false), {
      headers: { "Content-Type": "text/html" },
    });
  }

  if (!code || !state) {
    return new NextResponse(
      renderHTML("Missing parameters", "No authorization code received.", false),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const service = consumeOAuthState(state);
  if (!service) {
    return new NextResponse(
      renderHTML("Invalid state", "OAuth state expired or invalid. Try again.", false),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  try {
    const origin = req.nextUrl.origin;
    // Must match the redirect_uri used in the authorize request
    const redirectUri = getRedirectUri(origin, service);
    const tokens = await exchangeCode(service, code, redirectUri);
    saveTokens(service, tokens);

    const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
    return new NextResponse(
      renderHTML(
        `${serviceName} connected`,
        "You can close this tab and return to Cockpit.",
        true
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err: any) {
    return new NextResponse(
      renderHTML("Connection failed", err.message || "Unknown error", false),
      { headers: { "Content-Type": "text/html" } }
    );
  }
}

function renderHTML(title: string, message: string, success: boolean): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  return `<!DOCTYPE html>
<html>
<head>
  <title>Cockpit - ${safeTitle}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "SF Mono", Monaco, Inconsolata, monospace;
      background: #0a0a0a;
      color: #e8e8e8;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }
    .container { text-align: center; max-width: 400px; }
    .icon {
      width: 48px; height: 48px;
      border-radius: 50%;
      border: 2px solid ${success ? "#4ade80" : "#f87171"};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1rem;
      font-size: 1.2rem;
      color: ${success ? "#4ade80" : "#f87171"};
    }
    h1 { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem; }
    p { font-size: 0.7rem; color: #888; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${success ? "&#10003;" : "&#10007;"}</div>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
  </div>
  ${success ? "<script>setTimeout(() => window.close(), 2000)</script>" : ""}
</body>
</html>`;
}

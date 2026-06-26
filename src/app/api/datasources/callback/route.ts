import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  consumeComposioOAuthState,
  consumeOAuthState,
  createComposioOAuthState,
  saveTokens,
  saveComposioConnection,
} from "@/lib/datasources/token-store";
import { exchangeCode } from "@/lib/datasources/manager";
import type { ServiceId } from "@/lib/datasources/types";
import { createConnectLink, isAllowedComposioRedirectUrl, isComposioEnabled } from "@/lib/datasources/composio";

function getRedirectUri(origin: string, _service: ServiceId): string {
  return `${origin}/api/datasources/callback`;
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
  // ─── Composio callback ──────────────────────────────────────────
  // Composio redirects here after the user completes Google auth.
  // The ?composio= param tells us which toolkit just connected.
  const composioToolkit = req.nextUrl.searchParams.get("composio");
  if (composioToolkit && isComposioEnabled()) {
    return handleComposioCallback(req, composioToolkit);
  }

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

  const stateResult = consumeOAuthState(state);
  if (!stateResult) {
    return new NextResponse(
      renderHTML("Invalid state", "OAuth state expired or invalid. Try again.", false),
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const { service, codeVerifier } = stateResult;

  try {
    const origin = req.nextUrl.origin;
    // Must match the redirect_uri used in the authorize request
    const redirectUri = getRedirectUri(origin, service);
    const tokens = await exchangeCode(service, code, redirectUri, codeVerifier);
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
  } catch (err: unknown) {
    console.error("[OAuth callback]", err);
    return new NextResponse(
      renderHTML(
        "Connection failed",
        "Something went wrong while connecting. Please close this tab and try again from Cockpit.",
        false
      ),
      { headers: { "Content-Type": "text/html" } }
    );
  }
}

async function handleComposioCallback(
  req: NextRequest,
  toolkit: string,
): Promise<NextResponse> {
  const origin = req.nextUrl.origin;

  // The connected_account_id may come as a query param from Composio's redirect
  const connectionId = req.nextUrl.searchParams.get("connected_account_id") || "";
  const state = req.nextUrl.searchParams.get("state") || "";
  const stateResult = state ? consumeComposioOAuthState(state) : null;

  if (!stateResult) {
    return new NextResponse(
      renderHTML("Invalid state", "Composio OAuth state expired or invalid. Try again.", false),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (stateResult.toolkit !== toolkit || stateResult.connectionId !== connectionId) {
    return new NextResponse(
      renderHTML("Connection failed", "Composio callback did not match the connection you started.", false),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (toolkit === "googlecalendar") {
    // Save Calendar connection
    if (connectionId) {
      saveComposioConnection("googlecalendar", connectionId);
    }

    // Chain: now connect Gmail
    try {
      const gmailState = crypto.randomUUID();
      const gmailCallbackUrl = `${origin}/api/datasources/callback?composio=gmail&state=${encodeURIComponent(gmailState)}`;
      const link = await createConnectLink("gmail", gmailCallbackUrl);
      createComposioOAuthState("gmail", link.connectionId, gmailState);
      if (!isAllowedComposioRedirectUrl(link.redirectUrl)) {
        throw new Error("Unexpected Composio redirect URL");
      }
      // Redirect the browser to Gmail auth
      return NextResponse.redirect(link.redirectUrl);
    } catch (err) {
      console.error("[Composio] Gmail connect failed, Calendar still connected:", err);
      // Calendar connected but Gmail failed — show partial success
      return new NextResponse(
        renderHTML(
          "Google Calendar connected",
          "Calendar is connected. Gmail connection failed — you can retry from Settings.",
          true,
        ),
        { headers: { "Content-Type": "text/html" } },
      );
    }
  }

  if (toolkit === "gmail") {
    // Save Gmail connection
    if (connectionId) {
      saveComposioConnection("gmail", connectionId);
    }

    return new NextResponse(
      renderHTML(
        "Google connected",
        "Calendar and Gmail are connected. You can close this tab and return to Cockpit.",
        true,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  return new NextResponse(
    renderHTML("Unknown toolkit", `Unexpected toolkit: ${toolkit}`, false),
    { headers: { "Content-Type": "text/html" } },
  );
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

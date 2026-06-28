import { NextRequest, NextResponse } from "next/server";
import { clearDatasourceDataCache } from "@/lib/datasources/manager";
import { completeMcpAuthorization } from "@/lib/datasources/mcp-oauth";
import { enableService } from "@/lib/datasources/token-store";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeOAuthMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|client[_-]?secret|code[_-]?verifier|authorization|secret)\b\s*[:=]\s*["']?[^"'\s&]+/gi,
      "$1=[redacted]",
    )
    .slice(0, 700);
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
    .container { text-align: center; max-width: 420px; padding: 1rem; }
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
    p { font-size: 0.72rem; color: #888; line-height: 1.6; }
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

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const errorDescription = req.nextUrl.searchParams.get("error_description");

  if (error) {
    const detail = errorDescription ? `${error}: ${errorDescription}` : error;
    return new NextResponse(
      renderHTML("MCP connection failed", sanitizeOAuthMessage(detail), false),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  if (!code || !state) {
    return new NextResponse(
      renderHTML("Missing parameters", "No authorization code received.", false),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  try {
    const server = await completeMcpAuthorization(
      state,
      code,
      `${req.nextUrl.origin}/api/datasources/mcp/callback`,
    );

    if (server.preset === "granola" || server.preset === "attio") {
      enableService(server.preset);
    }
    clearDatasourceDataCache();

    return new NextResponse(
      renderHTML(
        `${server.name} connected`,
        "You can close this tab and return to Cockpit.",
        true,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  } catch (err) {
    console.error("[MCP OAuth callback]", err);
    const message = err instanceof Error ? err.message : "MCP authorization failed.";
    return new NextResponse(
      renderHTML("MCP connection failed", sanitizeOAuthMessage(message), false),
      { headers: { "Content-Type": "text/html" } },
    );
  }
}

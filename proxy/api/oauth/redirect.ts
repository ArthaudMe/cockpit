/**
 * OAuth Redirect Bounce
 *
 * Receives the OAuth callback from providers (code + state) over HTTPS,
 * then redirects to the cockpit:// deep link so the Electron app can
 * handle the token exchange locally.
 *
 * Register this URL as the redirect URI with all OAuth providers:
 *   https://proxy-mio-xyz.vercel.app/api/oauth/redirect
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error, error_description } = req.query;

  const params = new URLSearchParams();
  if (code) params.set("code", String(code));
  if (state) params.set("state", String(state));
  if (error) params.set("error", String(error));
  if (error_description) params.set("error_description", String(error_description));

  const deepLink = `cockpit://oauth/callback?${params}`;
  const safeLink = escapeAttr(deepLink);

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Cockpit</title>
  <meta http-equiv="refresh" content="0;url=${safeLink}">
</head>
<body style="font-family:-apple-system,system-ui,sans-serif;background:#0a0a0a;color:#e8e8e8;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <div style="text-align:center;">
    <p style="margin-bottom:0.5rem;">Redirecting to Cockpit...</p>
    <p style="font-size:0.8rem;color:#666;"><a href="${safeLink}" style="color:#888;">Click here</a> if not redirected.</p>
  </div>
</body>
</html>`);
}

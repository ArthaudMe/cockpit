/**
 * OAuth Token Proxy
 *
 * Holds client secrets server-side so they never ship in the desktop app.
 * Handles two operations:
 *   - grant_type=authorization_code → exchange auth code for tokens
 *   - grant_type=refresh_token     → refresh an expired access token
 *
 * Deploy to Vercel with env vars:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 *   LINEAR_CLIENT_ID, LINEAR_CLIENT_SECRET
 *   SLACK_CLIENT_ID, SLACK_CLIENT_SECRET
 *   NOTION_CLIENT_ID, NOTION_CLIENT_SECRET
 *   PROXY_SECRET — shared secret the desktop app sends to authenticate
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const SERVICES: Record<
  string,
  {
    tokenUrl: string;
    clientIdVar: string;
    clientSecretVar: string;
    // Some providers use different content types or auth methods
    authMethod?: "basic" | "body";
    contentType?: "json" | "form";
  }
> = {
  google: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdVar: "GOOGLE_CLIENT_ID",
    clientSecretVar: "GOOGLE_CLIENT_SECRET",
  },
  github: {
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientIdVar: "GITHUB_CLIENT_ID",
    clientSecretVar: "GITHUB_CLIENT_SECRET",
    contentType: "json",
  },
  linear: {
    tokenUrl: "https://api.linear.app/oauth/token",
    clientIdVar: "LINEAR_CLIENT_ID",
    clientSecretVar: "LINEAR_CLIENT_SECRET",
  },
  slack: {
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientIdVar: "SLACK_CLIENT_ID",
    clientSecretVar: "SLACK_CLIENT_SECRET",
  },
  notion: {
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    clientIdVar: "NOTION_CLIENT_ID",
    clientSecretVar: "NOTION_CLIENT_SECRET",
    authMethod: "basic",
    contentType: "json",
  },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Authenticate the request
  const proxySecret = process.env.PROXY_SECRET;
  if (proxySecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${proxySecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  const { service, grant_type, code, refresh_token, redirect_uri } = req.body || {};

  if (!service || !SERVICES[service]) {
    return res.status(400).json({ error: `Invalid service. Must be one of: ${Object.keys(SERVICES).join(", ")}` });
  }

  if (!grant_type || !["authorization_code", "refresh_token"].includes(grant_type)) {
    return res.status(400).json({ error: "grant_type must be authorization_code or refresh_token" });
  }

  const svc = SERVICES[service];
  const clientId = process.env[svc.clientIdVar];
  const clientSecret = process.env[svc.clientSecretVar];

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: `${service} credentials not configured on proxy` });
  }

  try {
    let headers: Record<string, string> = {};
    let body: string;

    if (svc.authMethod === "basic") {
      // Notion uses Basic auth
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;
    }

    if (svc.contentType === "json") {
      headers["Content-Type"] = "application/json";
      headers["Accept"] = "application/json";

      const payload: Record<string, string> = { grant_type };
      if (!svc.authMethod) {
        payload.client_id = clientId;
        payload.client_secret = clientSecret;
      }
      if (grant_type === "authorization_code") {
        payload.code = code;
        if (redirect_uri) payload.redirect_uri = redirect_uri;
      } else {
        payload.refresh_token = refresh_token;
      }
      body = JSON.stringify(payload);
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded";

      const params = new URLSearchParams({ grant_type });
      if (!svc.authMethod) {
        params.set("client_id", clientId);
        params.set("client_secret", clientSecret);
      }
      if (grant_type === "authorization_code") {
        params.set("code", code);
        if (redirect_uri) params.set("redirect_uri", redirect_uri);
      } else {
        params.set("refresh_token", refresh_token);
      }
      body = params.toString();
    }

    const response = await fetch(svc.tokenUrl, {
      method: "POST",
      headers,
      body,
    });

    const data = await response.json();

    // Forward the provider's response as-is
    return res.status(response.ok ? 200 : 400).json(data);
  } catch (err) {
    console.error("[proxy] token exchange error:", (err as Error).message);
    return res.status(500).json({ error: "Token exchange failed" });
  }
}

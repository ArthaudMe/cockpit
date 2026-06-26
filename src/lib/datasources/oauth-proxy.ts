/**
 * OAuth proxy client.
 *
 * In production (Electron), token exchange and refresh go through the remote
 * proxy so that client secrets never ship in the binary.
 *
 * In development, falls back to direct exchange using local env vars.
 */

import type { ServiceId } from "./types";

// The proxy URL is public. The shared secret is intentionally NOT in source:
// it's inlined at build time from OAUTH_PROXY_SECRET (see next.config.ts),
// which `next build`/`next dev` read from .env.local.
const PROXY_URL = process.env.OAUTH_PROXY_URL || "";
const PROXY_SECRET = process.env.OAUTH_PROXY_SECRET || "";

export function isProxyEnabled(): boolean {
  return !!(PROXY_URL && PROXY_SECRET);
}

export async function proxyExchangeCode(
  service: ServiceId,
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<Record<string, any>> {
  const res = await fetch(`${PROXY_URL}/api/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(PROXY_SECRET ? { Authorization: `Bearer ${PROXY_SECRET}` } : {}),
    },
    body: JSON.stringify({
      service,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || "Token exchange failed");
  }
  return data;
}

export async function proxyRefreshToken(
  service: ServiceId,
  refreshToken: string
): Promise<Record<string, any>> {
  const res = await fetch(`${PROXY_URL}/api/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(PROXY_SECRET ? { Authorization: `Bearer ${PROXY_SECRET}` } : {}),
    },
    body: JSON.stringify({
      service,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || "Token refresh failed");
  }
  return data;
}

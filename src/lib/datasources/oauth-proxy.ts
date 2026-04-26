/**
 * OAuth proxy client.
 *
 * In production (Electron), token exchange and refresh go through the remote
 * proxy so that client secrets never ship in the binary.
 *
 * In development, falls back to direct exchange using local env vars.
 */

import type { ServiceId } from "./types";

// Falls back to env var for local dev override
const PROXY_URL = process.env.OAUTH_PROXY_URL || "https://proxy-mio-xyz.vercel.app";
const PROXY_SECRET = process.env.OAUTH_PROXY_SECRET || "44fa96b71e6d7f602c404cf341cf1ff0cd8a3aa0e2351b8c6f2cd81edd67254a";

export function isProxyEnabled(): boolean {
  return !!PROXY_URL;
}

export async function proxyExchangeCode(
  service: ServiceId,
  code: string,
  redirectUri: string
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

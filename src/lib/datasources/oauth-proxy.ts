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

function tokenEndpoint(): string {
  return `${PROXY_URL.replace(/\/+$/, "")}/api/oauth/token`;
}

async function readJson(res: Response): Promise<Record<string, any>> {
  try {
    return await res.json();
  } catch {
    throw new Error(`OAuth proxy returned a non-JSON response (${res.status})`);
  }
}

export async function proxyPreflight(service: ServiceId): Promise<void> {
  if (!PROXY_URL || !PROXY_SECRET) {
    throw new Error(
      "OAuth proxy is not configured in this build. Rebuild Cockpit with OAUTH_PROXY_URL and OAUTH_PROXY_SECRET."
    );
  }

  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PROXY_SECRET}`,
    },
    body: JSON.stringify({
      service,
      grant_type: "preflight",
    }),
  });

  const data = await readJson(res);
  if (!res.ok || data.error || data.ok !== true) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`OAuth proxy preflight failed for ${service}: ${detail}`);
  }
}

export async function assertProxyClientId(
  service: ServiceId,
  expectedClientId: string,
): Promise<void> {
  if (!PROXY_URL || !PROXY_SECRET) return;

  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PROXY_SECRET}`,
    },
    body: JSON.stringify({
      service,
      grant_type: "preflight",
    }),
  });

  const data = await readJson(res);
  if (!res.ok || data.error || data.ok !== true) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    throw new Error(`OAuth proxy preflight failed for ${service}: ${detail}`);
  }

  const proxyClientId =
    typeof data.client_id === "string" ? data.client_id.trim() : "";
  if (proxyClientId && proxyClientId !== expectedClientId.trim()) {
    throw new Error(
      `OAuth proxy client ID mismatch for ${service}. Rebuild Cockpit with the same ${service.toUpperCase()}_CLIENT_ID configured on the proxy.`
    );
  }
}

export async function proxyExchangeCode(
  service: ServiceId,
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<Record<string, any>> {
  const res = await fetch(tokenEndpoint(), {
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

  const data = await readJson(res);
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || "Token exchange failed");
  }
  return data;
}

export async function proxyRefreshToken(
  service: ServiceId,
  refreshToken: string
): Promise<Record<string, any>> {
  const res = await fetch(tokenEndpoint(), {
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

  const data = await readJson(res);
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || "Token refresh failed");
  }
  return data;
}

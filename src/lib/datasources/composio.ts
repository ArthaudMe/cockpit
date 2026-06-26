/**
 * Composio API client.
 *
 * Thin HTTP wrapper for the Composio REST API.  Used to connect Google
 * (Calendar + Gmail) via Composio's managed OAuth so we never need to go
 * through Google's CASA verification ourselves.
 *
 * Required env vars (set in .env.local):
 *   COMPOSIO_API_KEY            — project API key from composio.dev
 *   COMPOSIO_GCAL_AUTH_CONFIG   — auth config ID for Google Calendar toolkit
 *   COMPOSIO_GMAIL_AUTH_CONFIG  — auth config ID for Gmail toolkit
 */

const BASE_URL = "https://backend.composio.dev";
const TIMEOUT = 30_000;

// ─── Config ──────────────────────────────────────────────────────

function getApiKey(): string {
  return process.env.COMPOSIO_API_KEY || "";
}

export function isComposioEnabled(): boolean {
  return !!(
    getApiKey() &&
    process.env.COMPOSIO_GCAL_AUTH_CONFIG &&
    process.env.COMPOSIO_GMAIL_AUTH_CONFIG
  );
}

/** Stable user ID within a single Cockpit installation. */
const ENTITY_ID = "default";

// ─── HTTP helpers ────────────────────────────────────────────────

async function composioFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getApiKey(),
        ...(init.headers as Record<string, string>),
      },
    });

    const data = await res.json();
    if (!res.ok) {
      const msg =
        data?.message || data?.error || `Composio API error ${res.status}`;
      throw new Error(msg);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Connect link ────────────────────────────────────────────────

export type ComposioToolkit = "googlecalendar" | "gmail";

interface LinkResponse {
  connected_account_id: string;
  redirect_url: string;
}

/**
 * Creates a hosted auth link the user can visit to connect a Google toolkit.
 * After auth, Composio redirects to `callbackUrl`.
 */
export async function createConnectLink(
  toolkit: ComposioToolkit,
  callbackUrl: string,
): Promise<{ connectionId: string; redirectUrl: string }> {
  const authConfigId =
    toolkit === "googlecalendar"
      ? process.env.COMPOSIO_GCAL_AUTH_CONFIG!
      : process.env.COMPOSIO_GMAIL_AUTH_CONFIG!;

  const data = await composioFetch<LinkResponse>(
    "/api/v3.1/connected_accounts/link",
    {
      method: "POST",
      body: JSON.stringify({
        auth_config_id: authConfigId,
        user_id: ENTITY_ID,
        callback_url: callbackUrl,
      }),
    },
  );

  return {
    connectionId: data.connected_account_id,
    redirectUrl: data.redirect_url,
  };
}

export function isAllowedComposioRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      (host === "composio.dev" ||
        host.endsWith(".composio.dev") ||
        host === "composio.com" ||
        host.endsWith(".composio.com"))
    );
  } catch {
    return false;
  }
}

// ─── Connection status ───────────────────────────────────────────

interface ConnectionListResponse {
  items: Array<{
    id: string;
    status: string;
    toolkitSlug?: string;
    toolkit?: { slug?: string };
  }>;
}

/**
 * Returns the ID of the active connected account for a toolkit, or null.
 */
export async function getActiveConnection(
  toolkit: ComposioToolkit,
): Promise<string | null> {
  try {
    const authConfigId =
      toolkit === "googlecalendar"
        ? process.env.COMPOSIO_GCAL_AUTH_CONFIG!
        : process.env.COMPOSIO_GMAIL_AUTH_CONFIG!;

    const data = await composioFetch<ConnectionListResponse>(
      `/api/v3.1/connected_accounts?user_id=${ENTITY_ID}&status=ACTIVE&auth_config_id=${authConfigId}`,
    );

    return data.items?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

interface ConnectionResponse {
  id: string;
  status: string;
}

/**
 * Checks whether a specific connected account has reached ACTIVE status.
 */
export async function isConnectionActive(
  connectionId: string,
): Promise<boolean> {
  try {
    const data = await composioFetch<ConnectionResponse>(
      `/api/v3.1/connected_accounts/${encodeURIComponent(connectionId)}`,
    );
    return data.status === "ACTIVE";
  } catch {
    return false;
  }
}

// ─── Tool execution ──────────────────────────────────────────────

interface ExecuteResponse {
  data: Record<string, unknown>;
  successful: boolean;
  error?: string;
}

/**
 * Execute a Composio tool (e.g. GOOGLECALENDAR_EVENTS_LIST).
 */
export async function executeAction(
  toolSlug: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const data = await composioFetch<ExecuteResponse>(
    `/api/v3.1/tools/execute/${encodeURIComponent(toolSlug)}`,
    {
      method: "POST",
      body: JSON.stringify({
        user_id: ENTITY_ID,
        arguments: args,
        version: "latest",
      }),
    },
  );

  if (!data.successful && data.error) {
    throw new Error(`Composio action failed: ${data.error}`);
  }

  return data.data ?? {};
}

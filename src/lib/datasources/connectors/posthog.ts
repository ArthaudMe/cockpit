import fs from "fs";
import path from "path";
import os from "os";
import type { MetricValue } from "../types";
import { invalidateFileCache, readJsonCached } from "../../fs-cache";
import { fetchWithTimeout } from "../http";

const STORE_DIR = path.join(os.homedir(), ".cockpit");
const CONFIG_PATH = path.join(STORE_DIR, "posthog.json");
const DEFAULT_API_HOST = "https://us.posthog.com";

export type PostHogConfig = {
  apiHost: string;
  projectId: string;
  personalApiKey: string;
};

function ensureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

// Any IPv4 literal is treated as untrusted — the personalApiKey is sent as a
// Bearer token to this host, so an IP literal (metadata endpoints, loopback,
// RFC1918) is a classic SSRF target. Self-hosted deployments must use a real
// DNS hostname.
function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function normalizeApiHost(apiHost?: string): string {
  const raw = (apiHost || DEFAULT_API_HOST).trim().replace(/\/+$/, "");
  // The charset here already excludes ports, paths, credentials and IPv6
  // brackets, so `host` below is only the hostname.
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(raw)) {
    throw new Error("PostHog API host must be an https URL.");
  }
  const host = raw.slice("https://".length).toLowerCase();

  // Official PostHog cloud (app./eu./us. and friends) is always allowed.
  if (host === "posthog.com" || host.endsWith(".posthog.com")) {
    return raw;
  }

  // SSRF guardrails for self-hosted hosts.
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("PostHog API host may not point at localhost.");
  }
  if (isIpv4Literal(host)) {
    throw new Error("PostHog API host must be a hostname, not an IP address.");
  }
  // Require a real domain: at least one dot and at least one letter. This blocks
  // decimal/hex-encoded IPs (e.g. 2130706433) and bare single-label hostnames.
  if (!host.includes(".") || !/[a-z]/.test(host)) {
    throw new Error("PostHog API host must be a valid domain.");
  }
  return raw;
}

export function getPostHogConfig(): PostHogConfig | null {
  return readJsonCached<PostHogConfig | null>(CONFIG_PATH, null);
}

export function isPostHogConfigured(): boolean {
  const config = getPostHogConfig();
  return !!(config?.apiHost && config.projectId && config.personalApiKey);
}

export function savePostHogConfig(config: PostHogConfig) {
  ensureDir();
  const payload: PostHogConfig = {
    apiHost: normalizeApiHost(config.apiHost),
    projectId: config.projectId.trim(),
    personalApiKey: config.personalApiKey.trim(),
  };
  if (!payload.projectId || !payload.personalApiKey) {
    throw new Error("PostHog project ID and personal API key are required.");
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(payload, null, 2), { mode: 0o600 });
  invalidateFileCache(CONFIG_PATH);
}

export function removePostHogConfig() {
  try {
    fs.rmSync(CONFIG_PATH, { force: true });
    invalidateFileCache(CONFIG_PATH);
  } catch {
    // ignore
  }
}

async function fetchPostHogJson(pathname: string, config: PostHogConfig): Promise<any> {
  // Route through the shared helper for the request timeout + bounded retry.
  const res = await fetchWithTimeout(
    `${config.apiHost}${pathname}`,
    {
      headers: {
        Authorization: `Bearer ${config.personalApiKey}`,
        Accept: "application/json",
      },
    },
    { service: "posthog" },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `PostHog API returned HTTP ${res.status}`);
  }
  return data;
}

export async function validatePostHogConfig(config: PostHogConfig): Promise<void> {
  const normalized = {
    ...config,
    apiHost: normalizeApiHost(config.apiHost),
    projectId: config.projectId.trim(),
    personalApiKey: config.personalApiKey.trim(),
  };
  await fetchPostHogJson(`/api/projects/${encodeURIComponent(normalized.projectId)}/`, normalized);
}

export async function fetchPostHogMetrics(): Promise<Record<string, MetricValue>> {
  const config = getPostHogConfig();
  if (!config) return {};

  // A hard failure (auth, rate-limit, network) throws out of here so the
  // manager records the error and keeps last-good data instead of blanking the
  // tile. Only "not configured" returns empty above.
  const data = await fetchPostHogJson(
    `/api/projects/${encodeURIComponent(config.projectId)}/events/?limit=100&order=-timestamp`,
    config,
  );

  // NOTE: These counts are derived from only the most recent 100 events, so for
  // any active product the 24h/7d/active-user numbers are UNDER-REPORTED and
  // should be read as approximate ("last 100 events"), not exact totals. A
  // proper implementation would use a HogQL/trends aggregate query; that is left
  // as a follow-up to keep this change low-risk. The event math below is written
  // to never throw on missing/unparseable timestamps (NaN comparisons are just
  // treated as "outside the window").
  const events = Array.isArray(data?.results) ? data.results : [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const last24h = events.filter((event: any) => new Date(event.timestamp).getTime() >= dayAgo);
  const last7d = events.filter((event: any) => new Date(event.timestamp).getTime() >= weekAgo);
  const activeUsers = new Set(last7d.map((event: any) => event.distinct_id).filter(Boolean));

  return {
    events_24h: {
      value: last24h.length,
      change: "live",
      period: "24h",
    },
    events_7d: {
      value: last7d.length,
      change: "live",
      period: "7d",
    },
    active_users_7d: {
      value: activeUsers.size,
      change: "live",
      period: "7d",
    },
  };
}

import fs from "fs";
import path from "path";
import os from "os";
import type { MetricValue } from "../types";
import { invalidateFileCache, readJsonCached } from "../../fs-cache";

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

function normalizeApiHost(apiHost?: string): string {
  const host = (apiHost || DEFAULT_API_HOST).trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(host)) {
    throw new Error("PostHog API host must be an https URL.");
  }
  return host;
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
  const res = await fetch(`${config.apiHost}${pathname}`, {
    headers: {
      Authorization: `Bearer ${config.personalApiKey}`,
      Accept: "application/json",
    },
  });
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

  try {
    const data = await fetchPostHogJson(
      `/api/projects/${encodeURIComponent(config.projectId)}/events/?limit=100&order=-timestamp`,
      config,
    );
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
  } catch (err) {
    console.error("[PostHog] fetch metrics failed:", err);
    return {};
  }
}

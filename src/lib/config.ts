import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export type ConnectorConfig = {
  linear?: { apiKey: string; teamId?: string };
  github?: { token: string; org: string; repos?: string[] };
  "google-calendar"?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  };
  slack?: { token: string };
};

export type CockpitConfig = {
  connectors: ConnectorConfig;
};

const CONFIG_DIR = join(homedir(), ".cockpit");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfig(): CockpitConfig {
  ensureConfigDir();
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { connectors: {} };
  }
}

export function saveConfig(config: CockpitConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getConnectorConfig<K extends keyof ConnectorConfig>(
  connector: K,
): ConnectorConfig[K] | undefined {
  // Env vars take precedence
  if (connector === "linear") {
    const apiKey = process.env.COCKPIT_LINEAR_API_KEY;
    if (apiKey) return { apiKey } as ConnectorConfig[K];
  }
  if (connector === "github") {
    const token = process.env.COCKPIT_GITHUB_TOKEN;
    const org = process.env.COCKPIT_GITHUB_ORG;
    if (token && org) return { token, org } as ConnectorConfig[K];
  }
  if (connector === "google-calendar") {
    const clientId = process.env.COCKPIT_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.COCKPIT_GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.COCKPIT_GOOGLE_REFRESH_TOKEN;
    if (clientId && clientSecret && refreshToken)
      return { clientId, clientSecret, refreshToken } as ConnectorConfig[K];
  }
  if (connector === "slack") {
    const token = process.env.COCKPIT_SLACK_TOKEN;
    if (token) return { token } as ConnectorConfig[K];
  }

  // Fall back to config file
  const config = getConfig();
  return config.connectors[connector];
}

export function getConfigDir(): string {
  ensureConfigDir();
  return CONFIG_DIR;
}

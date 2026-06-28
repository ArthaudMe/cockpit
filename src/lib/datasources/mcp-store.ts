import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { readJsonCached, invalidateFileCache } from "../fs-cache";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

const STORE_DIR = path.join(os.homedir(), ".cockpit");
const STORE_PATH = path.join(STORE_DIR, "mcp-servers.json");

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse" | "streamable-http";
  preset?: "granola" | "attio";
  oauth?: {
    state?: string;
    codeVerifier?: string;
    clientInformation?: OAuthClientInformationMixed;
    tokens?: OAuthTokens;
  };
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse
  url?: string;
  // metadata
  enabled: boolean;
  addedAt: number;
}

const VALID_TRANSPORTS = new Set<string>(["stdio", "sse", "streamable-http"]);

/**
 * Validate a complete MCP server config (transport, command, url, args, env).
 * Returns null if valid, or an error message string if invalid.
 */
export function validateMcpServerConfig(
  config: Partial<McpServerConfig>,
): string | null {
  if (!config.transport || !VALID_TRANSPORTS.has(config.transport)) {
    return "transport must be 'stdio', 'sse', or 'streamable-http'";
  }

  if (config.transport === "stdio") {
    if (!config.command || typeof config.command !== "string") {
      return "command is required for stdio transport";
    }
    if (config.args !== undefined && !Array.isArray(config.args)) {
      return "args must be an array";
    }
    if (
      Array.isArray(config.args) &&
      config.args.some((a: unknown) => typeof a !== "string")
    ) {
      return "args must be an array of strings";
    }
  }

  if (config.transport === "sse" || config.transport === "streamable-http") {
    if (!config.url || typeof config.url !== "string") {
      return "url is required for remote MCP transport";
    }
    try {
      const parsed = new URL(config.url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("invalid protocol");
      }
    } catch {
      return "url must be a valid HTTP(S) URL";
    }
  }

  if (config.env !== undefined) {
    if (
      typeof config.env !== "object" ||
      config.env === null ||
      Array.isArray(config.env)
    ) {
      return "env must be an object with string values";
    }
    for (const [, v] of Object.entries(config.env)) {
      if (typeof v !== "string") {
        return "env must be an object with string values";
      }
    }
  }

  return null;
}

function ensureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

// Read on every datasource poll — cached by mtime instead of re-parsed.
function read(): McpServerConfig[] {
  return readJsonCached<McpServerConfig[]>(STORE_PATH, []);
}

function write(configs: McpServerConfig[]) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(configs, null, 2), {
    mode: 0o600,
  });
  invalidateFileCache(STORE_PATH);
}

export function getMcpServers(): McpServerConfig[] {
  return read();
}

export function getMcpServer(id: string): McpServerConfig | null {
  return read().find((s) => s.id === id) ?? null;
}

export function getMcpServerByPreset(preset: NonNullable<McpServerConfig["preset"]>): McpServerConfig | null {
  return read().find((s) => s.preset === preset) ?? null;
}

export function getMcpServerByOAuthState(state: string): McpServerConfig | null {
  return read().find((s) => s.oauth?.state === state) ?? null;
}

const MCP_PRESETS: Record<NonNullable<McpServerConfig["preset"]>, { name: string; url: string }> = {
  granola: {
    name: "Granola",
    url: "https://mcp.granola.ai/mcp",
  },
  attio: {
    name: "Attio",
    url: "https://mcp.attio.com/mcp",
  },
};

export function ensurePresetMcpServer(preset: NonNullable<McpServerConfig["preset"]>): McpServerConfig {
  const definition = MCP_PRESETS[preset];
  const existing = getMcpServerByPreset(preset);
  if (existing) {
    const updated: McpServerConfig = {
      ...existing,
      name: definition.name,
      transport: "streamable-http",
      url: definition.url,
      enabled: true,
      preset,
    };
    saveMcpServer(updated);
    return updated;
  }

  const config: McpServerConfig = {
    id: crypto.randomUUID(),
    name: definition.name,
    transport: "streamable-http",
    url: definition.url,
    enabled: true,
    preset,
    addedAt: Date.now(),
  };
  saveMcpServer(config);
  return config;
}

export function removeMcpServerByPreset(preset: NonNullable<McpServerConfig["preset"]>) {
  write(read().filter((s) => s.preset !== preset));
}

export function patchMcpServerOAuth(
  id: string,
  updater: (oauth: NonNullable<McpServerConfig["oauth"]>) => NonNullable<McpServerConfig["oauth"]>,
) {
  const configs = read();
  const idx = configs.findIndex((s) => s.id === id);
  if (idx < 0) return;
  configs[idx] = {
    ...configs[idx],
    oauth: updater({ ...(configs[idx].oauth || {}) }),
  };
  write(configs);
}

export function hasMcpOAuthTokens(config: McpServerConfig | null | undefined): boolean {
  return Boolean(config?.oauth?.tokens?.access_token);
}

export function saveMcpServer(config: McpServerConfig) {
  const configs = read();
  const idx = configs.findIndex((s) => s.id === config.id);
  if (idx >= 0) {
    configs[idx] = config;
  } else {
    configs.push(config);
  }
  write(configs);
}

export function removeMcpServer(id: string) {
  write(read().filter((s) => s.id !== id));
}

export function updateMcpServer(id: string, updates: Partial<McpServerConfig>) {
  const configs = read();
  const idx = configs.findIndex((s) => s.id === id);
  if (idx >= 0) {
    configs[idx] = { ...configs[idx], ...updates };
    write(configs);
  }
}

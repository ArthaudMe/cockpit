import fs from "fs";
import path from "path";
import os from "os";
import { readJsonCached, invalidateFileCache } from "../fs-cache";

const STORE_DIR = path.join(os.homedir(), ".cockpit");
const STORE_PATH = path.join(STORE_DIR, "mcp-servers.json");

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse";
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

const VALID_TRANSPORTS = new Set<string>(["stdio", "sse"]);

/**
 * Validate a complete MCP server config (transport, command, url, args, env).
 * Returns null if valid, or an error message string if invalid.
 */
export function validateMcpServerConfig(
  config: Partial<McpServerConfig>,
): string | null {
  if (!config.transport || !VALID_TRANSPORTS.has(config.transport)) {
    return "transport must be 'stdio' or 'sse'";
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

  if (config.transport === "sse") {
    if (!config.url || typeof config.url !== "string") {
      return "url is required for sse transport";
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

import fs from "fs";
import path from "path";
import os from "os";

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

function ensureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

function read(): McpServerConfig[] {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function write(configs: McpServerConfig[]) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(configs, null, 2), {
    mode: 0o600,
  });
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

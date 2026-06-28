import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { buildAgentEnv } from "../../agent-env";
import type { McpServerConfig } from "../mcp-store";
import type { McpResourceItem } from "../types";

const MAX_RESOURCE_TEXT = 2000;
const CONNECT_TIMEOUT = 15_000;
const RESOURCE_FETCH_TIMEOUT = 30_000;

// Environment variables that could enable code injection via dynamic linker
const DANGEROUS_ENV_KEYS = new Set([
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "DYLD_FRAMEWORK_PATH",
  "SHLIB_PATH",
  "LIBPATH",
  "NODE_OPTIONS",
  "ELECTRON_RUN_AS_NODE",
]);

export function buildMcpServerEnv(
  env: Record<string, string> | undefined,
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(env ?? {})) {
    if (!DANGEROUS_ENV_KEYS.has(key.toUpperCase()) && typeof value === "string") {
      safe[key] = value;
    }
  }
  return buildAgentEnv(safe) as Record<string, string>;
}

const clientCache = new Map<string, Client>();

async function createTransport(config: McpServerConfig) {
  if (config.transport === "stdio") {
    if (!config.command) throw new Error("stdio transport requires a command");
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: buildMcpServerEnv(config.env),
      stderr: "ignore",
    });
  }

  if (config.transport === "sse") {
    if (!config.url) throw new Error("sse transport requires a url");
    return new SSEClientTransport(new URL(config.url));
  }

  throw new Error(`Unknown transport: ${config.transport}`);
}

async function getOrCreateClient(config: McpServerConfig): Promise<Client> {
  const cached = clientCache.get(config.id);
  if (cached) return cached;

  const client = new Client(
    { name: "cockpit", version: "1.0.0" },
    { capabilities: {} },
  );

  const transport = await createTransport(config);
  await Promise.race([
    client.connect(transport),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timeout")), CONNECT_TIMEOUT),
    ),
  ]);

  clientCache.set(config.id, client);
  return client;
}

export async function disconnectClient(id: string) {
  const client = clientCache.get(id);
  if (client) {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
    clientCache.delete(id);
  }
}

export async function disconnectAll() {
  const ids = [...clientCache.keys()];
  await Promise.allSettled(ids.map((id) => disconnectClient(id)));
}

export async function fetchMcpResources(
  config: McpServerConfig,
): Promise<McpResourceItem[]> {
  return Promise.race([
    fetchMcpResourcesInner(config),
    new Promise<McpResourceItem[]>((_, reject) =>
      setTimeout(() => reject(new Error("MCP resource fetch timeout")), RESOURCE_FETCH_TIMEOUT),
    ),
  ]);
}

async function fetchMcpResourcesInner(
  config: McpServerConfig,
): Promise<McpResourceItem[]> {
  const client = await getOrCreateClient(config);

  const { resources } = await client.listResources();
  const items: McpResourceItem[] = [];

  for (const resource of resources) {
    try {
      const { contents } = await client.readResource({ uri: resource.uri });
      for (const content of contents) {
        const text =
          "text" in content
            ? (content.text as string)
            : "blob" in content
              ? `[binary data: ${content.mimeType || "unknown"}]`
              : "";

        items.push({
          serverId: config.id,
          serverName: config.name,
          uri: resource.uri,
          name: resource.name || resource.uri,
          mimeType: content.mimeType,
          text: text.slice(0, MAX_RESOURCE_TEXT),
          fetchedAt: Date.now(),
        });
      }
    } catch {
      // Skip individual resources that fail
    }
  }

  return items;
}

export async function testMcpConnection(
  config: McpServerConfig,
): Promise<{
  success: boolean;
  serverName?: string;
  resourceCount?: number;
  error?: string;
}> {
  try {
    const client = new Client(
      { name: "cockpit", version: "1.0.0" },
      { capabilities: {} },
    );

    const transport = await createTransport(config);
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), CONNECT_TIMEOUT),
      ),
    ]);

    const { resources } = await client.listResources();
    const serverInfo = client.getServerVersion();
    await client.close();

    return {
      success: true,
      serverName: serverInfo?.name,
      resourceCount: resources.length,
    };
  } catch (err) {
    console.error("[MCP test]", err);
    return {
      success: false,
      error: "Connection failed. Check the server URL and try again.",
    };
  }
}

// Cleanup on process exit
process.on("exit", () => {
  for (const client of clientCache.values()) {
    try {
      client.close();
    } catch {
      // best-effort
    }
  }
});

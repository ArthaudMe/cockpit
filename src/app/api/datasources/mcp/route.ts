import { NextRequest, NextResponse } from "next/server";
import { getMcpServers, saveMcpServer } from "@/lib/datasources/mcp-store";
import type { McpServerConfig } from "@/lib/datasources/mcp-store";

export async function GET() {
  return NextResponse.json(getMcpServers());
}

const VALID_TRANSPORTS = new Set(["stdio", "sse"]);

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  if (!body.transport || !VALID_TRANSPORTS.has(body.transport)) {
    return NextResponse.json(
      { error: "transport must be 'stdio' or 'sse'" },
      { status: 400 },
    );
  }

  if (body.transport === "stdio") {
    if (!body.command || typeof body.command !== "string") {
      return NextResponse.json(
        { error: "command is required for stdio transport" },
        { status: 400 },
      );
    }
    if (body.args && !Array.isArray(body.args)) {
      return NextResponse.json(
        { error: "args must be an array" },
        { status: 400 },
      );
    }
  }

  if (body.transport === "sse") {
    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json(
        { error: "url is required for sse transport" },
        { status: 400 },
      );
    }
    try {
      const parsed = new URL(body.url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("invalid protocol");
      }
    } catch {
      return NextResponse.json(
        { error: "url must be a valid HTTP(S) URL" },
        { status: 400 },
      );
    }
  }

  const config: McpServerConfig = {
    id: crypto.randomUUID(),
    name: String(body.name).slice(0, 100),
    transport: body.transport,
    command: body.command,
    args: Array.isArray(body.args) ? body.args.map(String) : [],
    env: body.env && typeof body.env === "object" && !Array.isArray(body.env) ? body.env : undefined,
    url: body.url,
    enabled: true,
    addedAt: Date.now(),
  };

  saveMcpServer(config);
  return NextResponse.json(config, { status: 201 });
}

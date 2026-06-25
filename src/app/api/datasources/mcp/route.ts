import { NextRequest, NextResponse } from "next/server";
import {
  getMcpServers,
  saveMcpServer,
  validateMcpServerConfig,
} from "@/lib/datasources/mcp-store";
import type { McpServerConfig } from "@/lib/datasources/mcp-store";

export async function GET() {
  return NextResponse.json(getMcpServers());
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 },
    );
  }

  const validationError = validateMcpServerConfig(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const config: McpServerConfig = {
    id: crypto.randomUUID(),
    name: String(body.name).slice(0, 100),
    transport: body.transport,
    command: body.command,
    args: Array.isArray(body.args) ? body.args.map(String) : [],
    env:
      body.env && typeof body.env === "object" && !Array.isArray(body.env)
        ? body.env
        : undefined,
    url: body.url,
    enabled: true,
    addedAt: Date.now(),
  };

  saveMcpServer(config);
  return NextResponse.json(config, { status: 201 });
}

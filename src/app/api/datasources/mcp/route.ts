import { NextRequest, NextResponse } from "next/server";
import { getMcpServers, saveMcpServer } from "@/lib/datasources/mcp-store";
import type { McpServerConfig } from "@/lib/datasources/mcp-store";

export async function GET() {
  return NextResponse.json(getMcpServers());
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name || !body.transport) {
    return NextResponse.json(
      { error: "name and transport are required" },
      { status: 400 },
    );
  }

  if (body.transport === "stdio" && !body.command) {
    return NextResponse.json(
      { error: "command is required for stdio transport" },
      { status: 400 },
    );
  }

  if (body.transport === "sse" && !body.url) {
    return NextResponse.json(
      { error: "url is required for sse transport" },
      { status: 400 },
    );
  }

  const config: McpServerConfig = {
    id: crypto.randomUUID(),
    name: body.name,
    transport: body.transport,
    command: body.command,
    args: body.args || [],
    env: body.env,
    url: body.url,
    enabled: true,
    addedAt: Date.now(),
  };

  saveMcpServer(config);
  return NextResponse.json(config, { status: 201 });
}

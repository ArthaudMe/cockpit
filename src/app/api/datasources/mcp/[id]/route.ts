import { NextRequest, NextResponse } from "next/server";
import {
  getMcpServer,
  updateMcpServer,
  removeMcpServer,
  validateMcpServerConfig,
} from "@/lib/datasources/mcp-store";
import { disconnectClient } from "@/lib/datasources/connectors/mcp";
import type { McpServerConfig } from "@/lib/datasources/mcp-store";

function publicMcpServer(config: McpServerConfig) {
  const safe: Partial<McpServerConfig> = { ...config };
  delete safe.oauth;
  delete safe.env;
  return safe;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(publicMcpServer(server));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates = await req.json();
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  // Don't allow changing the id or addedAt
  delete updates.id;
  delete updates.addedAt;
  delete updates.oauth;

  // Validate the merged config (existing + patch), not just the patch alone
  const merged = { ...server, ...updates };
  const validationError = validateMcpServerConfig(merged);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Sanitize fields before persisting
  if (typeof updates.name === "string") {
    updates.name = updates.name.slice(0, 100);
  }
  if (Array.isArray(updates.args)) {
    updates.args = updates.args.map(String);
  }

  updateMcpServer(id, updates);

  // If config changed, disconnect so it reconnects with new config
  await disconnectClient(id);

  const updated = getMcpServer(id);
  return NextResponse.json(updated ? publicMcpServer(updated) : null);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await disconnectClient(id);
  removeMcpServer(id);
  return NextResponse.json({ ok: true });
}

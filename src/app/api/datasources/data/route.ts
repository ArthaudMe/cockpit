import { NextResponse } from "next/server";
import { fetchAllData, getDatasourceStatuses } from "@/lib/datasources/manager";
import { getMcpServers } from "@/lib/datasources/mcp-store";

export async function GET() {
  try {
    const data = await fetchAllData();
    const statuses = getDatasourceStatuses();
    const connected: Record<string, boolean> = {};
    for (const s of statuses) {
      connected[s.id] = s.connected;
    }
    // Include MCP servers in connection status
    for (const mcp of getMcpServers()) {
      connected[`mcp:${mcp.id}`] = mcp.enabled;
    }
    return NextResponse.json({ ...data, _connected: connected });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch data" },
      { status: 500 }
    );
  }
}

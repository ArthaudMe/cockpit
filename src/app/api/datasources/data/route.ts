import { NextResponse } from "next/server";
import { fetchAllData, getDatasourceStatuses } from "@/lib/datasources/manager";
import { getMcpServers } from "@/lib/datasources/mcp-store";
import { writeHistory } from "@/lib/knowledge/writer";
import { writeDatasourceCache, readDatasourceCache } from "@/lib/datasources/cache";

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

    const response = { ...data, _connected: connected };

    // Fire-and-forget: persist to filesystem history
    try {
      writeHistory(data);
    } catch {
      // Never let history writes affect the response
    }

    // Cache successful response to disk for offline resilience
    writeDatasourceCache(response);

    return NextResponse.json(response);
  } catch (err: any) {
    // On failure, try to return cached data with offline flag
    const cached = readDatasourceCache();
    if (cached) {
      return NextResponse.json({
        ...cached.data,
        _offline: true,
        _cachedAt: cached.cachedAt,
      });
    }

    return NextResponse.json(
      { error: err.message || "Failed to fetch data" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { fetchAllData, getDatasourceStatuses } from "@/lib/datasources/manager";

export async function GET() {
  try {
    const data = await fetchAllData();
    const statuses = getDatasourceStatuses();
    const connected: Record<string, boolean> = {};
    for (const s of statuses) {
      connected[s.id] = s.connected;
    }
    return NextResponse.json({ ...data, _connected: connected });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch data" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getDatasourceStatuses } from "@/lib/datasources/manager";

export async function GET() {
  const statuses = getDatasourceStatuses();
  return NextResponse.json({ datasources: statuses });
}

import { NextResponse } from "next/server";
import { getBackendDefs } from "@/lib/agent-manager";

export async function GET() {
  return NextResponse.json(getBackendDefs());
}

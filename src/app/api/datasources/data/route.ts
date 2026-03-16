import { NextResponse } from "next/server";
import { fetchAllData } from "@/lib/datasources/manager";

export async function GET() {
  try {
    const data = await fetchAllData();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch data" },
      { status: 500 }
    );
  }
}

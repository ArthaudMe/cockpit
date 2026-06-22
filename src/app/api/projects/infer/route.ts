import { NextResponse } from "next/server";
import { fetchAllData } from "@/lib/datasources/manager";
import { inferProjects, clearInferCache } from "@/lib/projects/infer";

export async function GET() {
  try {
    const data = await fetchAllData();
    const projects = await inferProjects(data);
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[Projects infer]", err);
    return NextResponse.json(
      { error: "Failed to infer projects" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    clearInferCache();
    const data = await fetchAllData();
    const projects = await inferProjects(data);
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("[Projects infer]", err);
    return NextResponse.json(
      { error: "Failed to infer projects" },
      { status: 500 },
    );
  }
}

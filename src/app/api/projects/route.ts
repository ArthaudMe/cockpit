import { NextResponse } from "next/server";
import { getProjects, createProject } from "@/lib/projects/store";

export async function GET() {
  return NextResponse.json(getProjects());
}

export async function POST(req: Request) {
  const body = await req.json();
  const project = createProject({
    name: body.name || "Untitled Project",
    category: body.category || "General",
    status: body.status || "Active",
    tools: body.tools || [],
    description: body.description,
  });
  return NextResponse.json(project);
}

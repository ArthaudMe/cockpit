import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import type { Project } from "../route";

const PROJECTS_PATH = path.join(os.homedir(), ".cockpit", "projects.json");

function readProjects(): Project[] {
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeProjects(projects: Project[]) {
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(projects, null, 2));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const projects = readProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.name !== undefined) projects[idx].name = body.name.trim();
  if (body.color !== undefined) projects[idx].color = body.color;
  writeProjects(projects);
  return NextResponse.json(projects[idx]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projects = readProjects();
  const filtered = projects.filter((p) => p.id !== id);
  if (filtered.length === projects.length)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  writeProjects(filtered);
  return NextResponse.json({ ok: true });
}

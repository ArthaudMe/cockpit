import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const PROJECTS_PATH = path.join(os.homedir(), ".cockpit", "projects.json");
const MAX_PROJECTS = 5;

export type Project = {
  id: string;
  name: string;
  color: string;
};

const COLORS = ["#4ade80", "#60a5fa", "#f59e0b", "#a78bfa", "#f472b6"];

function readProjects(): Project[] {
  try {
    const data = fs.readFileSync(PROJECTS_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeProjects(projects: Project[]) {
  const dir = path.dirname(PROJECTS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(projects, null, 2));
}

export async function GET() {
  return NextResponse.json(readProjects());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const projects = readProjects();

  if (projects.length >= MAX_PROJECTS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_PROJECTS} projects allowed` },
      { status: 400 }
    );
  }

  const project: Project = {
    id: crypto.randomBytes(4).toString("hex"),
    name: body.name?.trim() || "Untitled",
    color: body.color || COLORS[projects.length % COLORS.length],
  };

  projects.push(project);
  writeProjects(projects);
  return NextResponse.json(project, { status: 201 });
}

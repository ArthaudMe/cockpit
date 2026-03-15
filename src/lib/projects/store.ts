import fs from "fs";
import path from "path";
import os from "os";

const STORE_DIR = path.join(os.homedir(), ".cockpit");
const STORE_PATH = path.join(STORE_DIR, "projects.json");

export interface Project {
  id: string;
  name: string;
  category: string;
  status: "Active" | "Paused" | "Done";
  tools: string[];
  description?: string;
  createdAt: string;
  updatedAt: string;
}

function ensureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

function read(): Project[] {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function write(projects: Project[]) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(projects, null, 2), {
    mode: 0o600,
  });
}

export function getProjects(): Project[] {
  return read();
}

export function createProject(
  project: Omit<Project, "id" | "createdAt" | "updatedAt">
): Project {
  const projects = read();
  const now = new Date().toISOString();
  const newProject: Project = {
    ...project,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  projects.push(newProject);
  write(projects);
  return newProject;
}

export function updateProject(
  id: string,
  updates: Partial<Omit<Project, "id" | "createdAt">>
): Project | null {
  const projects = read();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return null;
  projects[index] = {
    ...projects[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  write(projects);
  return projects[index];
}

export function deleteProject(id: string): boolean {
  const projects = read();
  const filtered = projects.filter((p) => p.id !== id);
  if (filtered.length === projects.length) return false;
  write(filtered);
  return true;
}

export function setProjects(projects: Project[]) {
  write(projects);
}

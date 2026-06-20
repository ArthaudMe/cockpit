import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { invalidateFileCache } from "@/lib/fs-cache";
import { loadProfile } from "@/lib/context";

const PROFILE_PATH = path.join(os.homedir(), ".cockpit", "profile.json");

function writeProfile(profile: ReturnType<typeof loadProfile>) {
  const dir = path.dirname(PROFILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
  invalidateFileCache(PROFILE_PATH);
}

export async function GET() {
  return NextResponse.json(loadProfile());
}

const ALLOWED_FIELDS = new Set(["name", "role", "company"]);

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const current = loadProfile();
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key) && typeof value === "string") {
      filtered[key] = value.slice(0, 255);
    }
  }
  const updated = { ...current, ...filtered };
  writeProfile(updated);
  return NextResponse.json(updated);
}

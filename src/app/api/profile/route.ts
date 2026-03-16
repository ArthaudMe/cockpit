import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

const PROFILE_PATH = path.join(os.homedir(), ".cockpit", "profile.json");

type Profile = {
  name: string;
  role: string;
  company: string;
};

function readProfile(): Profile {
  try {
    const data = fs.readFileSync(PROFILE_PATH, "utf-8");
    return JSON.parse(data);
  } catch {
    return { name: "", role: "", company: "" };
  }
}

function writeProfile(profile: Profile) {
  const dir = path.dirname(PROFILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
}

export async function GET() {
  return NextResponse.json(readProfile());
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const current = readProfile();
  const updated = { ...current, ...body };
  writeProfile(updated);
  return NextResponse.json(updated);
}

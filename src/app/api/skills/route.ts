import { NextResponse } from "next/server";
import { SKILLS, loadEnabledSkills, saveEnabledSkills, type SkillId } from "@/lib/skills";

export async function GET() {
  const enabled = loadEnabledSkills();
  const skills = SKILLS.map((s) => ({
    ...s,
    enabled: enabled.includes(s.id),
  }));
  return NextResponse.json(skills);
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, enabled: isEnabled } = body as { id: SkillId; enabled: boolean };

    if (!SKILLS.find((s) => s.id === id)) {
      return NextResponse.json({ error: "Unknown skill" }, { status: 400 });
    }

    const current = loadEnabledSkills();
    let updated: SkillId[];

    if (isEnabled) {
      updated = current.includes(id) ? current : [...current, id];
    } else {
      updated = current.filter((s) => s !== id);
    }

    saveEnabledSkills(updated);
    return NextResponse.json({ id, enabled: isEnabled });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

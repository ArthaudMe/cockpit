import { NextRequest, NextResponse } from "next/server";
import { loadCustomSkills, processSkillCommand } from "@/lib/skills-custom";
import type { SkillCreateCommand } from "@/lib/skills-custom";

export async function GET() {
  const skills = loadCustomSkills();
  return NextResponse.json(skills);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SkillCreateCommand;

    if (!body.cockpit_skill && !body.action) {
      return NextResponse.json(
        { ok: false, error: "Invalid skill command" },
        { status: 400 },
      );
    }

    // Default action to "create" if not specified
    const cmd: SkillCreateCommand = {
      ...body,
      cockpit_skill: true,
      action: body.action || "create",
    };

    const result = processSkillCommand(cmd);

    return NextResponse.json(result, {
      status: result.ok ? 200 : 400,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing skill id" },
      { status: 400 },
    );
  }

  const result = processSkillCommand({
    cockpit_skill: true,
    action: "delete",
    id,
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : 400,
  });
}

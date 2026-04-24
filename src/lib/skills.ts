import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { SKILLS, type SkillId, type SkillDef } from "./skills-defs";
import { loadCustomSkills } from "./skills-custom";

export type { SkillId, SkillCategory, SkillDef } from "./skills-defs";
export { SKILLS } from "./skills-defs";

// ─── Persistence (server-only) ──────────────────────────────────────

const COCKPIT_DIR = join(homedir(), ".cockpit");
const SKILLS_FILE = join(COCKPIT_DIR, "skills.json");

const DEFAULT_ENABLED: SkillId[] = SKILLS.map((s) => s.id);

export function loadEnabledSkills(): SkillId[] {
  try {
    if (!existsSync(SKILLS_FILE)) return DEFAULT_ENABLED;
    const raw = readFileSync(SKILLS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return data.enabled || DEFAULT_ENABLED;
  } catch {
    return DEFAULT_ENABLED;
  }
}

export function saveEnabledSkills(enabled: SkillId[]) {
  try {
    mkdirSync(COCKPIT_DIR, { recursive: true });
    writeFileSync(SKILLS_FILE, JSON.stringify({ enabled }, null, 2));
  } catch (err) {
    console.error("[skills] failed to save:", err);
  }
}

/** Get all skills: built-in (filtered by enabled) + all custom skills */
export function getAllActiveSkills(): SkillDef[] {
  const enabled = loadEnabledSkills();
  const builtIn = SKILLS.filter((s) => enabled.includes(s.id));
  const custom = loadCustomSkills();
  return [...builtIn, ...custom];
}

export function getEnabledSkillDefs() {
  return getAllActiveSkills();
}

/**
 * Build the skills section to append to the system prompt.
 */
export function buildSkillsPromptSection(): string {
  const skills = getAllActiveSkills();
  if (skills.length === 0) return "";

  const skillBlocks = skills
    .map(
      (s) =>
        `### ${s.name} (${s.slash})${(s as any).custom ? " [custom]" : ""}\n${s.promptInstruction}`
    )
    .join("\n\n");

  return `\n\n## Active Skills\n\nYou have the following skills enabled. When the user's message matches a skill's domain, follow that skill's instructions for formatting and structure. When a skill is actively being used, prefix your response with [skill: ${"{skill_slash}"}] on the first line.\n\n${skillBlocks}`;
}

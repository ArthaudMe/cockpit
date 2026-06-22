import {
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  mkdirSync,
  existsSync,
} from "fs";
import { join, resolve, sep } from "path";
import { homedir } from "os";
import type { SkillDef, SkillCategory } from "./skills-defs";

const CUSTOM_SKILLS_DIR = join(homedir(), ".cockpit", "custom-skills");

export interface CustomSkillDef extends SkillDef {
  custom: true;
  createdAt: string;
}

export interface SkillCreateCommand {
  cockpit_skill: true;
  action: "create" | "update" | "delete";
  id?: string;
  name?: string;
  slash?: string;
  icon?: string;
  description?: string;
  category?: SkillCategory;
  promptInstruction?: string;
  triggerHints?: string[];
  outputFormat?: string;
}

function ensureDir() {
  if (!existsSync(CUSTOM_SKILLS_DIR)) {
    mkdirSync(CUSTOM_SKILLS_DIR, { recursive: true, mode: 0o700 });
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// Skill IDs become filenames. `extractAndProcessSkills` runs automatically on
// every assistant response, so a prompt-injected reply could otherwise supply
// an `id` like "../../../etc/whatever" and write attacker-controlled JSON
// outside the skills dir. IDs are constrained to this shape, and the resolved
// path is asserted to stay inside CUSTOM_SKILLS_DIR before any read/write.
const VALID_ID = /^custom-[a-z0-9-]{1,60}$/;

function isValidSkillId(id: string): boolean {
  return VALID_ID.test(id);
}

/** Resolve `<dir>/<id>.json`, or null if the id is invalid or escapes the dir. */
function skillFilePath(id: string): string | null {
  if (!isValidSkillId(id)) return null;
  const resolved = resolve(CUSTOM_SKILLS_DIR, `${id}.json`);
  const base = resolve(CUSTOM_SKILLS_DIR);
  if (resolved !== join(base, `${id}.json`)) return null;
  if (!resolved.startsWith(base + sep)) return null;
  return resolved;
}

// Loaded on every system prompt build — cache the directory scan and only
// re-read when a skill mutation happens here (or the TTL lapses, to pick
// up files edited outside the app).
let _skillsCache: CustomSkillDef[] | null = null;
let _skillsCacheTime = 0;
const SKILLS_CACHE_TTL = 30_000;

function invalidateSkillsCache() {
  _skillsCache = null;
}

export function loadCustomSkills(): CustomSkillDef[] {
  if (_skillsCache && Date.now() - _skillsCacheTime < SKILLS_CACHE_TTL) {
    return _skillsCache;
  }

  ensureDir();
  const skills: CustomSkillDef[] = [];

  try {
    const files = readdirSync(CUSTOM_SKILLS_DIR).filter((f) =>
      f.endsWith(".json"),
    );
    for (const file of files) {
      try {
        const raw = readFileSync(join(CUSTOM_SKILLS_DIR, file), "utf-8");
        const skill = JSON.parse(raw) as CustomSkillDef;
        if (skill.id && skill.name && skill.promptInstruction) {
          skills.push({ ...skill, custom: true });
        }
      } catch {
        // Skip malformed files
      }
    }
  } catch {
    // Dir read failed
  }

  _skillsCache = skills;
  _skillsCacheTime = Date.now();
  return skills;
}

export function saveCustomSkill(cmd: SkillCreateCommand): {
  ok: boolean;
  skill?: CustomSkillDef;
  error?: string;
} {
  if (!cmd.name?.trim()) return { ok: false, error: "Missing skill name" };
  if (!cmd.promptInstruction?.trim())
    return { ok: false, error: "Missing promptInstruction" };

  ensureDir();

  // Always derive the id from the name on create — never trust a model- or
  // user-supplied id for a path. (Updates address an existing validated id.)
  const id = `custom-${slugify(cmd.name)}`;
  const slash = cmd.slash || `/${slugify(cmd.name)}`;

  const filePath = skillFilePath(id);
  if (!filePath) return { ok: false, error: "Invalid skill name" };

  // Validate slash doesn't conflict with built-in skills
  // (caller should check against SKILLS array)

  const skill: CustomSkillDef = {
    id: id as any,
    name: cmd.name.trim(),
    slash,
    icon: cmd.icon || "★",
    description: cmd.description?.trim() || `Custom skill: ${cmd.name}`,
    category: cmd.category || "leadership",
    promptInstruction: cmd.promptInstruction.trim(),
    triggerHints: cmd.triggerHints || [],
    outputFormat: cmd.outputFormat || "text",
    custom: true,
    createdAt: new Date().toISOString(),
  };

  try {
    writeFileSync(filePath, JSON.stringify(skill, null, 2), { mode: 0o600 });
    invalidateSkillsCache();
    return { ok: true, skill };
  } catch (err) {
    return { ok: false, error: "Failed to save the skill. Please try again." };
  }
}

export function updateCustomSkill(cmd: SkillCreateCommand): {
  ok: boolean;
  skill?: CustomSkillDef;
  error?: string;
} {
  if (!cmd.id) return { ok: false, error: "Missing skill id for update" };

  const filePath = skillFilePath(cmd.id);
  if (!filePath) return { ok: false, error: "Invalid skill id" };
  if (!existsSync(filePath))
    return { ok: false, error: `Skill "${cmd.id}" not found` };

  try {
    const existing = JSON.parse(
      readFileSync(filePath, "utf-8"),
    ) as CustomSkillDef;

    const updated: CustomSkillDef = {
      ...existing,
      name: cmd.name?.trim() || existing.name,
      slash: cmd.slash || existing.slash,
      icon: cmd.icon || existing.icon,
      description: cmd.description?.trim() || existing.description,
      category: cmd.category || existing.category,
      promptInstruction:
        cmd.promptInstruction?.trim() || existing.promptInstruction,
      triggerHints: cmd.triggerHints || existing.triggerHints,
      outputFormat: cmd.outputFormat || existing.outputFormat,
      custom: true,
    };

    writeFileSync(filePath, JSON.stringify(updated, null, 2), {
      mode: 0o600,
    });
    invalidateSkillsCache();
    return { ok: true, skill: updated };
  } catch (err) {
    return { ok: false, error: "Failed to update the skill. Please try again." };
  }
}

export function deleteCustomSkill(id: string): {
  ok: boolean;
  error?: string;
} {
  const filePath = skillFilePath(id);
  if (!filePath) return { ok: false, error: "Invalid skill id" };
  if (!existsSync(filePath)) return { ok: false, error: `Skill "${id}" not found` };

  try {
    unlinkSync(filePath);
    invalidateSkillsCache();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: "Failed to delete the skill. Please try again." };
  }
}

export function processSkillCommand(cmd: SkillCreateCommand): {
  ok: boolean;
  skill?: CustomSkillDef;
  error?: string;
} {
  switch (cmd.action) {
    case "create":
      return saveCustomSkill(cmd);
    case "update":
      return updateCustomSkill(cmd);
    case "delete":
      if (!cmd.id) return { ok: false, error: "Missing skill id for delete" };
      return deleteCustomSkill(cmd.id);
    default:
      return { ok: false, error: `Unknown action: ${cmd.action}` };
  }
}

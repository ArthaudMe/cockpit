import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Point homedir at a temp dir BEFORE importing (CUSTOM_SKILLS_DIR is computed
// from homedir() at module load).
const fakeHome = mkdtempSync(join(tmpdir(), "skills-test-"));
process.env.HOME = fakeHome;

const { saveCustomSkill, updateCustomSkill, deleteCustomSkill } = await import(
  "../skills-custom"
);

const skillsDir = join(fakeHome, ".cockpit", "custom-skills");

describe("custom skill path-traversal hardening", () => {
  afterAll(() => rmSync(fakeHome, { recursive: true, force: true }));

  it("ignores a model-supplied id on create and derives it from the name", () => {
    const res = saveCustomSkill({
      cockpit_skill: true,
      action: "create",
      name: "My Skill",
      promptInstruction: "do the thing",
      id: "../../../../tmp/evil", // attempted traversal
    });

    expect(res.ok).toBe(true);
    expect(res.skill?.id).toBe("custom-my-skill");
    expect(existsSync(join(skillsDir, "custom-my-skill.json"))).toBe(true);
    // The traversal target must NOT have been written.
    expect(existsSync("/tmp/evil.json")).toBe(false);
  });

  it("rejects a traversal id on update", () => {
    const res = updateCustomSkill({
      cockpit_skill: true,
      action: "update",
      id: "../../../../tmp/evil",
      name: "x",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/invalid skill id/i);
  });

  it("rejects a traversal id on delete", () => {
    const res = deleteCustomSkill("../../etc/passwd");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/invalid skill id/i);
  });

  it("allows a normal update/delete round-trip", () => {
    const created = saveCustomSkill({
      cockpit_skill: true,
      action: "create",
      name: "Round Trip",
      promptInstruction: "v1",
    });
    expect(created.ok).toBe(true);
    const id = created.skill!.id;

    const updated = updateCustomSkill({
      cockpit_skill: true,
      action: "update",
      id,
      promptInstruction: "v2",
    });
    expect(updated.ok).toBe(true);
    expect(updated.skill?.promptInstruction).toBe("v2");

    const deleted = deleteCustomSkill(id);
    expect(deleted.ok).toBe(true);
    expect(existsSync(join(skillsDir, `${id}.json`))).toBe(false);
  });
});

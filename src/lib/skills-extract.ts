import type { SkillCreateCommand } from "./skills-custom";

/**
 * Extract cockpit_skill commands from an LLM response.
 *
 * Skill proposals affect future system prompts, so they must not be persisted
 * directly from model output. The UI renders a proposal card; only the user's
 * explicit Save click calls POST /api/skills/custom. This applies to create,
 * update, and delete commands.
 */
export function extractAndProcessSkills(responseText: string): {
  processed: Array<{
    command: SkillCreateCommand;
    result: { ok: boolean; error?: string };
  }>;
} {
  const processed: Array<{
    command: SkillCreateCommand;
    result: { ok: boolean; error?: string };
  }> = [];

  const blockPattern =
    /```json\s*\n(\{[\s\S]*?"cockpit_skill"\s*:\s*true[\s\S]*?\})\s*\n```/g;

  let match;
  while ((match = blockPattern.exec(responseText)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      if (!parsed.cockpit_skill) continue;
      if (!parsed.action || !parsed.name) continue;

      const cmd = parsed as unknown as SkillCreateCommand;

      processed.push({ command: cmd, result: { ok: false, error: "Requires user approval" } });
    } catch {
      // Invalid JSON — skip
    }
  }

  return { processed };
}

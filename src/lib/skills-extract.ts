import { processSkillCommand, type SkillCreateCommand } from "./skills-custom";

/**
 * Extract cockpit_skill commands from an LLM response.
 *
 * SECURITY: "create" actions are NOT auto-persisted. They are extracted
 * for the UI to render a SkillProposalCard so the user can explicitly
 * approve (Save) or reject (Dismiss) them. Auto-persisting creates would
 * allow prompt-injected model output to install durable prompt
 * instructions without user consent.
 *
 * "update" and "delete" actions still require explicit skill references
 * and are processed server-side since they act on existing user-approved
 * skills.
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

      // Skip "create" — requires explicit user approval via SkillProposalCard.
      // The UI component persists via POST /api/skills/custom on Save.
      if (cmd.action === "create") continue;

      // Process update/delete server-side (they reference existing skills)
      const result = processSkillCommand(cmd);
      processed.push({ command: cmd, result });
    } catch {
      // Invalid JSON — skip
    }
  }

  return { processed };
}

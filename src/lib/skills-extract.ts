import { processSkillCommand, type SkillCreateCommand } from "./skills-custom";

/**
 * Extract and execute cockpit_skill commands from an LLM response.
 * Processes them server-side (like memory commands) so skills are saved
 * even if the user doesn't click the UI card.
 *
 * NOTE: The UI also shows a SkillProposalCard for user confirmation.
 * Server-side auto-processing only runs for action: "create" to ensure
 * the skill is available immediately. The UI card is still shown for
 * visibility.
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

      // Only auto-process creates — updates and deletes require explicit user action
      if (cmd.action !== "create") continue;

      const result = processSkillCommand(cmd);
      processed.push({ command: cmd, result });
    } catch {
      // Invalid JSON — skip
    }
  }

  return { processed };
}

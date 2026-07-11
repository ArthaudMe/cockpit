export {
  MemoryStore,
  getMemoryStore,
  resetMemoryStore,
  getLastMemoryError,
  type MemoryTarget,
  type MemoryAction,
  type MemoryCommand,
} from "./store";

import { getMemoryStore, type MemoryCommand } from "./store";

/**
 * Build the memory section for the system prompt.
 */
export function buildMemoryPromptSection(): string {
  return getMemoryStore().formatForSystemPrompt();
}

/**
 * Extract and execute memory commands from an LLM response.
 * Returns the response with memory blocks stripped out.
 */
export function extractAndProcessMemories(responseText: string): {
  cleanedText: string;
  processed: Array<{ command: MemoryCommand; result: { ok: boolean; error?: string } }>;
  failures: Array<{ command: MemoryCommand; error: string }>;
} {
  const store = getMemoryStore();
  const processed: Array<{
    command: MemoryCommand;
    result: { ok: boolean; error?: string };
  }> = [];
  const failures: Array<{ command: MemoryCommand; error: string }> = [];

  // Match JSON code blocks with cockpit_memory
  const blockPattern = /```json\s*\n(\{[\s\S]*?"cockpit_memory"\s*:\s*true[\s\S]*?\})\s*\n```/g;

  let cleanedText = responseText;
  let match;

  // Collect all matches first
  const matches: Array<{ full: string; json: string }> = [];
  while ((match = blockPattern.exec(responseText)) !== null) {
    matches.push({ full: match[0], json: match[1] });
  }

  for (const m of matches) {
    try {
      const cmd = JSON.parse(m.json) as Record<string, unknown>;

      if (!cmd.cockpit_memory) continue;
      if (!cmd.action || !cmd.target) continue;

      const action = cmd.action as string;
      const target = cmd.target as string;
      if (!["add", "replace", "remove"].includes(action)) continue;
      if (!["memory", "user"].includes(target)) continue;

      const memCmd: MemoryCommand = {
        action: action as MemoryCommand["action"],
        target: target as MemoryCommand["target"],
        content: cmd.content as string | undefined,
        old_text: cmd.old_text as string | undefined,
      };

      let result: { ok: boolean; error?: string };

      switch (memCmd.action) {
        case "add":
          result = store.add(memCmd.target, memCmd.content || "");
          break;
        case "replace":
          result = store.replace(
            memCmd.target,
            memCmd.old_text || "",
            memCmd.content || ""
          );
          break;
        case "remove":
          result = store.remove(memCmd.target, memCmd.old_text || "");
          break;
      }

      processed.push({ command: memCmd, result });
      if (!result.ok) {
        failures.push({
          command: memCmd,
          error: result.error ?? "Unknown memory error",
        });
      }

      // Strip the memory block from the displayed text
      cleanedText = cleanedText.replace(m.full, "");
    } catch {
      // Invalid JSON — skip
    }
  }

  // Clean up extra blank lines left by stripped blocks
  cleanedText = cleanedText.replace(/\n{3,}/g, "\n\n").trim();

  return { cleanedText, processed, failures };
}

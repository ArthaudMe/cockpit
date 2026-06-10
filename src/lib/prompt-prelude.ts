/**
 * Per-message prompt prelude.
 *
 * Warm CLI processes are spawned with the system prompt baked in, so
 * anything that depends on the current message (focus context, relevant
 * history, recent conversation) must travel with the user prompt instead.
 */

import { searchHistory } from "./knowledge/search";
import { getRecentMessages } from "./knowledge/conversations";

const HISTORY_RESULT_LIMIT = 5;
const HISTORY_DAYS = 7;
const CONVERSATION_TURNS = 8;
const CONVERSATION_TURN_MAX_CHARS = 400;

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

/** Past workspace items (Slack, calendar, PRs, ...) relevant to the message. */
function buildHistoricalSection(message: string): string {
  try {
    const results = searchHistory({
      query: message,
      limit: HISTORY_RESULT_LIMIT,
      dateRange: { from: daysAgo(HISTORY_DAYS), to: daysAgo(0) },
    });
    if (results.length === 0) return "";

    const lines = results.map((r) => {
      const dateStr = r.timestamp ? r.timestamp.split("T")[0] : "";
      const snippet = r.snippet ? `: ${r.snippet.slice(0, 80)}` : "";
      return `- [${r.source}${dateStr ? `, ${dateStr}` : ""}] ${r.title}${snippet}`;
    });
    return `[Possibly relevant past items from the user's workspace:\n${lines.join("\n")}]`;
  } catch {
    // History search must never block a chat message
    return "";
  }
}

/** The agent's own recent turns, so one-shot CLI calls keep continuity. */
function buildConversationSection(agentId: string): string {
  try {
    const recent = getRecentMessages(agentId, CONVERSATION_TURNS);
    if (recent.length === 0) return "";

    const lines = recent.map((m) => {
      const content =
        m.content.length > CONVERSATION_TURN_MAX_CHARS
          ? m.content.slice(0, CONVERSATION_TURN_MAX_CHARS) + "…"
          : m.content;
      return `${m.role}: ${content}`;
    });
    return `[Recent conversation between you and the user:\n${lines.join("\n")}]`;
  } catch {
    return "";
  }
}

export function buildPromptPrelude(opts: {
  message: string;
  focusContext?: string;
  agentId?: string;
}): string {
  const sections: string[] = [];

  if (opts.focusContext) {
    sections.push(
      `[The user is currently focused on this section of their cockpit:\n${opts.focusContext}]`
    );
  }

  if (opts.agentId) {
    const conversation = buildConversationSection(opts.agentId);
    if (conversation) sections.push(conversation);
  }

  if (opts.message) {
    const historical = buildHistoricalSection(opts.message);
    if (historical) sections.push(historical);
  }

  if (sections.length === 0) return opts.message;
  return `${sections.join("\n\n")}\n\n${opts.message}`;
}

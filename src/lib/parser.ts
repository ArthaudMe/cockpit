export type RenderBlock =
  | {
      cockpit_render: "table";
      title?: string;
      columns: string[];
      rows: string[][];
    }
  | {
      cockpit_render: "bar_chart";
      title?: string;
      data: { label: string; value: number }[];
    }
  | {
      cockpit_render: "card_grid";
      title?: string;
      cards: {
        title: string;
        status?: string;
        subtitle?: string;
        items?: string[];
      }[];
    }
  | {
      cockpit_render: "layout";
      direction: "row" | "column";
      children: RenderBlock[];
    }
  | {
      cockpit_render: "mermaid";
      code: string;
      title?: string;
    };

export type SubagentSuggestion = {
  name: string;
  role: string;
  task: string;
};

export type ParsedSegment =
  | { type: "text"; content: string }
  | { type: "render"; block: RenderBlock }
  | { type: "loading" }
  | { type: "skill_active"; skillSlash: string }
  | { type: "subagent_suggestion"; suggestion: SubagentSuggestion };

/**
 * Find the matching closing brace for an opening brace at `start`.
 * Returns the index of the closing brace, or -1 if not found.
 * Handles nested braces and strings correctly.
 */
function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1; // unclosed
}

export function parseResponse(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];

  // Pre-pass: detect [skill: /slash] tag on first line
  const skillMatch = text.match(/^\[skill:\s*(\/\w+)\]\s*\n?/);
  if (skillMatch) {
    segments.push({ type: "skill_active", skillSlash: skillMatch[1] });
    text = text.slice(skillMatch[0].length);
  }

  // Find ```json fence openings
  const fenceOpen = /```json\s*\n/g;
  let lastIndex = 0;
  let match;

  while ((match = fenceOpen.exec(text)) !== null) {
    const contentStart = match.index + match[0].length;

    // Find the closing fence — handle both \n``` and ```  at end of content
    let closeIdx = text.indexOf("\n```", contentStart);
    if (closeIdx === -1) {
      // Try without leading newline (e.g. content ends with }```)
      const altIdx = text.indexOf("```", contentStart);
      if (altIdx !== -1 && altIdx > contentStart) {
        closeIdx = altIdx - 1; // adjust so slice logic still works
      }
    }

    if (closeIdx === -1) {
      // Incomplete block (still streaming) — emit text before it + loading
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ type: "text", content: before });
      segments.push({ type: "loading" });
      lastIndex = text.length; // consume everything
      break;
    }

    const jsonBody = text.slice(contentStart, closeIdx).trim();
    const fenceEnd = closeIdx + 4; // length of "\n```"

    // Try to find a JSON object with cockpit_render
    const braceStart = jsonBody.indexOf("{");
    if (braceStart !== -1) {
      const closingBrace = findMatchingBrace(jsonBody, braceStart);
      if (closingBrace !== -1) {
        const jsonStr = jsonBody.slice(braceStart, closingBrace + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.cockpit_render) {
            const before = text.slice(lastIndex, match.index).trim();
            if (before) segments.push({ type: "text", content: before });
            segments.push({ type: "render", block: parsed as RenderBlock });
            lastIndex = fenceEnd;
            continue;
          }
          if (parsed.cockpit_memory) {
            // Memory commands are processed server-side — strip from display
            const before = text.slice(lastIndex, match.index).trim();
            if (before) segments.push({ type: "text", content: before });
            lastIndex = fenceEnd;
            continue;
          }
          if (parsed.cockpit_subagent && parsed.name && parsed.task) {
            const before = text.slice(lastIndex, match.index).trim();
            if (before) segments.push({ type: "text", content: before });
            segments.push({
              type: "subagent_suggestion",
              suggestion: { name: parsed.name, role: parsed.role || "general", task: parsed.task },
            });
            lastIndex = fenceEnd;
            continue;
          }
        } catch {
          // JSON parse failed, fall through to treat as regular text
        }
      }
    }

    // Not a cockpit_render block — skip it, let it be handled as regular text
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) segments.push({ type: "text", content: remaining });
  }

  return segments.length ? segments : [{ type: "text", content: text }];
}

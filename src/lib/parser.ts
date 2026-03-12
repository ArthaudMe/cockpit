export type MioRenderBlock =
  | {
      mio_render: "table";
      title?: string;
      columns: string[];
      rows: string[][];
    }
  | {
      mio_render: "bar_chart";
      title?: string;
      data: { label: string; value: number }[];
    }
  | {
      mio_render: "card_grid";
      title?: string;
      cards: {
        title: string;
        status?: string;
        subtitle?: string;
        items?: string[];
      }[];
    };

export type ParsedSegment =
  | { type: "text"; content: string }
  | { type: "render"; block: MioRenderBlock }
  | { type: "loading" };

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

    // Try to find a JSON object with mio_render
    const braceStart = jsonBody.indexOf("{");
    if (braceStart !== -1) {
      const closingBrace = findMatchingBrace(jsonBody, braceStart);
      if (closingBrace !== -1) {
        const jsonStr = jsonBody.slice(braceStart, closingBrace + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.mio_render) {
            // Success — add text before this block, then the render block
            const before = text.slice(lastIndex, match.index).trim();
            if (before) segments.push({ type: "text", content: before });
            segments.push({ type: "render", block: parsed as MioRenderBlock });
            lastIndex = fenceEnd;
            continue;
          }
        } catch {
          // JSON parse failed, fall through to treat as regular text
        }
      }
    }

    // Not a mio_render block — skip it, let it be handled as regular text
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) segments.push({ type: "text", content: remaining });
  }

  return segments.length ? segments : [{ type: "text", content: text }];
}

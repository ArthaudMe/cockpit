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
  | { type: "render"; block: MioRenderBlock };

export function parseResponse(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  // Match ```json blocks that contain mio_render
  const regex = /```json\s*\n(\{[\s\S]*?"mio_render"[\s\S]*?\})\s*\n```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before this block
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ type: "text", content: before });
    }

    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.mio_render) {
        segments.push({ type: "render", block: parsed as MioRenderBlock });
      } else {
        segments.push({ type: "text", content: match[0] });
      }
    } catch {
      segments.push({ type: "text", content: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) segments.push({ type: "text", content: remaining });
  }

  return segments.length ? segments : [{ type: "text", content: text }];
}

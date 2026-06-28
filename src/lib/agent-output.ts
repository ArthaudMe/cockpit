import type { ProviderDef } from "./provider-registry";

export type AgentOutputKind = ProviderDef["capabilities"]["output"]["kind"];

type CodexExecEvent = {
  type?: string;
  item?: {
    id?: string;
    type?: string;
    text?: string;
    details?: {
      type?: string;
      text?: string;
    };
  };
  message?: string;
  error?: {
    message?: string;
  };
};

export type AgentOutputChunk =
  | { kind: "assistant_delta"; text: string }
  | { kind: "error"; text: string };

export class AgentOutputParser {
  private readonly codexItemText = new Map<string, string>();
  private codexBuffer = "";

  constructor(private readonly kind: AgentOutputKind) {}

  push(raw: string): AgentOutputChunk[] {
    if (this.kind === "plain-text") {
      return raw ? [{ kind: "assistant_delta", text: raw }] : [];
    }

    this.codexBuffer += raw;
    const chunks: AgentOutputChunk[] = [];

    while (true) {
      const newline = this.codexBuffer.indexOf("\n");
      if (newline === -1) break;

      const line = this.codexBuffer.slice(0, newline).trim();
      this.codexBuffer = this.codexBuffer.slice(newline + 1);
      chunks.push(...this.parseCodexLine(line));
    }

    return chunks;
  }

  flush(): AgentOutputChunk[] {
    if (this.kind === "plain-text" || !this.codexBuffer.trim()) {
      this.codexBuffer = "";
      return [];
    }

    const line = this.codexBuffer.trim();
    this.codexBuffer = "";
    return this.parseCodexLine(line);
  }

  private parseCodexLine(line: string): AgentOutputChunk[] {
    if (!line) return [];

    let event: CodexExecEvent;
    try {
      event = JSON.parse(line) as CodexExecEvent;
    } catch {
      return [];
    }

    if (event.type === "error" || event.type === "turn.failed") {
      const message = event.message ?? event.error?.message;
      return message ? [{ kind: "error", text: message }] : [];
    }

    const item = event.item;
    const itemType = item?.details?.type ?? item?.type;
    const itemText = item?.details?.text ?? item?.text;
    if (!item?.id || itemType !== "agent_message" || typeof itemText !== "string") {
      return [];
    }

    const previous = this.codexItemText.get(item.id) ?? "";
    const current = itemText;
    this.codexItemText.set(item.id, current);

    if (!current || current === previous) return [];
    if (previous && current.startsWith(previous)) {
      return [{ kind: "assistant_delta", text: current.slice(previous.length) }];
    }

    return [{ kind: "assistant_delta", text: current }];
  }
}

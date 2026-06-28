import { describe, expect, it } from "vitest";
import { AgentOutputParser } from "../agent-output";

describe("AgentOutputParser", () => {
  it("passes through plain text output", () => {
    const parser = new AgentOutputParser("plain-text");
    expect(parser.push("hello")).toEqual([{ kind: "assistant_delta", text: "hello" }]);
    expect(parser.flush()).toEqual([]);
  });

  it("extracts assistant deltas from Codex JSONL agent messages", () => {
    const parser = new AgentOutputParser("codex-jsonl");
    const first = JSON.stringify({
      type: "item.updated",
      item: { id: "item-1", type: "agent_message", text: "Hello" },
    });
    const second = JSON.stringify({
      type: "item.updated",
      item: { id: "item-1", type: "agent_message", text: "Hello there" },
    });

    expect(parser.push(`${first}\n${second}\n`)).toEqual([
      { kind: "assistant_delta", text: "Hello" },
      { kind: "assistant_delta", text: " there" },
    ]);
  });

  it("handles split Codex JSONL chunks", () => {
    const parser = new AgentOutputParser("codex-jsonl");
    const event = JSON.stringify({
      type: "item.completed",
      item: { id: "item-1", type: "agent_message", text: "Done" },
    });

    expect(parser.push(event.slice(0, 10))).toEqual([]);
    expect(parser.push(`${event.slice(10)}\n`)).toEqual([
      { kind: "assistant_delta", text: "Done" },
    ]);
  });

  it("ignores non-message Codex events", () => {
    const parser = new AgentOutputParser("codex-jsonl");
    const event = JSON.stringify({
      type: "item.updated",
      item: { id: "item-1", type: "reasoning", text: "hidden" },
    });

    expect(parser.push(`${event}\n`)).toEqual([]);
  });

  it("extracts Codex turn failure messages", () => {
    const parser = new AgentOutputParser("codex-jsonl");
    const event = JSON.stringify({
      type: "turn.failed",
      error: { message: "Quota exceeded" },
    });

    expect(parser.push(`${event}\n`)).toEqual([
      { kind: "error", text: "Quota exceeded" },
    ]);
  });
});

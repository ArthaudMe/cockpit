import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Point os.homedir() at a temp dir BEFORE importing the module, so the
// history files land in an isolated location.
const fakeHome = mkdtempSync(join(tmpdir(), "conversations-test-"));
process.env.HOME = fakeHome;

const { persistMessage, getRecentMessages } = await import(
  "../knowledge/conversations"
);

function today(): string {
  return new Date().toISOString().split("T")[0];
}

const conversationsPath = join(
  fakeHome,
  ".cockpit",
  "history",
  today(),
  "conversations.json"
);

async function flushWrites() {
  // Writes are queued behind a promise chain; yield a few macrotasks
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 10));
    if (existsSync(conversationsPath)) return;
  }
}

describe("knowledge/conversations", () => {
  afterAll(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("persists messages to today's file", async () => {
    persistMessage({
      role: "user",
      content: "hello",
      timestamp: "2026-06-10T10:00:00Z",
      agentId: "a1",
    });
    await flushWrites();

    expect(existsSync(conversationsPath)).toBe(true);
    const stored = JSON.parse(readFileSync(conversationsPath, "utf-8"));
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("hello");
  });

  it("deduplicates identical messages", async () => {
    persistMessage({
      role: "user",
      content: "hello",
      timestamp: "2026-06-10T10:00:00Z",
      agentId: "a1",
    });
    await flushWrites();

    const stored = JSON.parse(readFileSync(conversationsPath, "utf-8"));
    expect(stored).toHaveLength(1);
  });

  it("returns recent messages for an agent only, oldest first", () => {
    persistMessage({
      role: "assistant",
      content: "hi there",
      timestamp: "2026-06-10T10:00:01Z",
      agentId: "a1",
    });
    persistMessage({
      role: "user",
      content: "other agent message",
      timestamp: "2026-06-10T10:00:02Z",
      agentId: "a2",
    });

    const recent = getRecentMessages("a1", 10);
    expect(recent.map((m) => m.content)).toEqual(["hello", "hi there"]);

    const other = getRecentMessages("a2", 10);
    expect(other.map((m) => m.content)).toEqual(["other agent message"]);
  });

  it("respects the limit, keeping the most recent", () => {
    for (let i = 0; i < 5; i++) {
      persistMessage({
        role: "user",
        content: `msg-${i}`,
        timestamp: `2026-06-10T11:00:0${i}Z`,
        agentId: "a3",
      });
    }
    const recent = getRecentMessages("a3", 2);
    expect(recent.map((m) => m.content)).toEqual(["msg-3", "msg-4"]);
  });

  it("does not leak the internal hash field", () => {
    const recent = getRecentMessages("a1", 1);
    expect(recent[0]).not.toHaveProperty("_hash");
  });
});

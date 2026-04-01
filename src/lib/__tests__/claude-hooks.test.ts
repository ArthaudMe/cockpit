import { describe, it, expect, afterEach } from "vitest";
import { setupClaudeHooks, cleanupClaudeHooks, cleanupAllHooks } from "../claude-hooks";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

describe("claude-hooks", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    cleanupAllHooks();
    // Cleanup any remaining dirs
    for (const dir of createdDirs) {
      try {
        if (existsSync(dir)) {
          const { rmSync } = require("fs");
          rmSync(dir, { recursive: true });
        }
      } catch { /* ignore */ }
    }
    createdDirs.length = 0;
  });

  it("creates hook directory with settings.local.json", () => {
    const hookDir = setupClaudeHooks({
      port: 12345,
      token: "test-token-abc",
      agentId: "agent-1",
    });
    createdDirs.push(hookDir);

    expect(existsSync(hookDir)).toBe(true);

    const settingsPath = join(hookDir, ".claude", "settings.local.json");
    expect(existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.Notification).toHaveLength(1);
    expect(settings.hooks.Stop).toHaveLength(1);
  });

  it("includes correct port and token in curl commands", () => {
    const hookDir = setupClaudeHooks({
      port: 9999,
      token: "my-secret-token",
      agentId: "agent-2",
    });
    createdDirs.push(hookDir);

    const settingsPath = join(hookDir, ".claude", "settings.local.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));

    const notifyCmd = settings.hooks.Notification[0].command;
    expect(notifyCmd).toContain("127.0.0.1:9999");
    expect(notifyCmd).toContain("my-secret-token");
    expect(notifyCmd).toContain("agent-2");
    expect(notifyCmd).toContain("notification");

    const stopCmd = settings.hooks.Stop[0].command;
    expect(stopCmd).toContain("127.0.0.1:9999");
    expect(stopCmd).toContain("my-secret-token");
    expect(stopCmd).toContain("agent-2");
    expect(stopCmd).toContain("stop");
  });

  it("cleanupClaudeHooks removes the directory", () => {
    const hookDir = setupClaudeHooks({
      port: 12345,
      token: "token",
      agentId: "agent-cleanup",
    });

    expect(existsSync(hookDir)).toBe(true);
    cleanupClaudeHooks("agent-cleanup");
    expect(existsSync(hookDir)).toBe(false);
  });

  it("cleanupClaudeHooks is safe for unknown agent", () => {
    // Should not throw
    cleanupClaudeHooks("nonexistent-agent");
  });

  it("cleanupAllHooks removes all hook directories", () => {
    const dir1 = setupClaudeHooks({ port: 1, token: "t", agentId: "a1" });
    const dir2 = setupClaudeHooks({ port: 2, token: "t", agentId: "a2" });
    const dir3 = setupClaudeHooks({ port: 3, token: "t", agentId: "a3" });

    expect(existsSync(dir1)).toBe(true);
    expect(existsSync(dir2)).toBe(true);
    expect(existsSync(dir3)).toBe(true);

    cleanupAllHooks();

    expect(existsSync(dir1)).toBe(false);
    expect(existsSync(dir2)).toBe(false);
    expect(existsSync(dir3)).toBe(false);
  });

  it("each agent gets a unique hook directory", () => {
    const dir1 = setupClaudeHooks({ port: 1, token: "t", agentId: "x1" });
    const dir2 = setupClaudeHooks({ port: 1, token: "t", agentId: "x2" });
    createdDirs.push(dir1, dir2);

    expect(dir1).not.toBe(dir2);
  });
});

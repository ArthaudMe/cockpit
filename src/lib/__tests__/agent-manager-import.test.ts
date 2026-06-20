import { describe, it, expect, vi } from "vitest";

// Detect any process spawn triggered merely by importing the module graph.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("child_process", async (orig) => {
  const actual = await orig<typeof import("child_process")>();
  return { ...actual, spawn: spawnMock };
});

describe("agent-manager import purity", () => {
  it("does not start the runtime or spawn processes at import", async () => {
    const mod = await import("../agent-manager");

    // Give any stray top-level async a chance to fire.
    await new Promise((r) => setTimeout(r, 200));

    // Build (route collection) imports this module; it must not spawn CLIs,
    // start the event server, or restore agents until a request asks it to.
    expect(spawnMock).not.toHaveBeenCalled();
    expect(mod.listAgents()).toEqual([]);
    expect(typeof mod.ensureAgentRuntimeStarted).toBe("function");
  });
});

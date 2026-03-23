import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import type { SessionForExtraction } from "../memory/types";

// Mock fs
vi.mock("fs", () => ({
  readFileSync: vi.fn(() => "[]"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

vi.mock("os", () => ({
  homedir: vi.fn(() => "/tmp/test-cockpit"),
}));

// Mock child_process to avoid actually spawning Claude
const mockStdout = { on: vi.fn() };
const mockStderr = { on: vi.fn() };
const mockStdin = { write: vi.fn(), end: vi.fn() };
const mockProc = {
  stdout: mockStdout,
  stderr: mockStderr,
  stdin: mockStdin,
  on: vi.fn(),
};

vi.mock("child_process", () => ({
  spawn: vi.fn(() => mockProc),
}));

import { extractMemories } from "../memory/observer";
import { clearAllMemories, getAllMemories } from "../memory/store";

describe("Memory Observer", () => {
  beforeEach(() => {
    clearAllMemories();
    vi.clearAllMocks();

    // Reset mock handlers
    mockStdout.on.mockReset();
    mockStderr.on.mockReset();
    mockProc.on.mockReset();
    mockStdin.write.mockReset();
    mockStdin.end.mockReset();
  });

  function simulateClaudeOutput(output: string) {
    // When extractMemories calls spawn, simulate Claude's response
    mockStdout.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
      if (event === "data") {
        handler(Buffer.from(output));
      }
    });

    mockStderr.on.mockImplementation(() => {});

    mockProc.on.mockImplementation((event: string, handler: (code: number) => void) => {
      if (event === "close") {
        handler(0);
      }
    });
  }

  it("skips conversations with fewer than 2 turns", async () => {
    const session: SessionForExtraction = {
      sessionId: "s1",
      agentId: "agent1",
      agentName: "Pilot",
      turns: [{ role: "user", content: "Hello" }],
      timestamp: Date.now(),
    };

    const result = await extractMemories(session);
    expect(result).toEqual([]);
  });

  it("extracts memories from valid Claude JSON output", async () => {
    const mockOutput = JSON.stringify([
      {
        category: "personal",
        content: "User's name is Alice",
        context: "User introduced themselves at the start",
        confidence: 0.95,
        tags: ["name", "identity"],
      },
      {
        category: "preferences",
        content: "User prefers TypeScript over JavaScript",
        context: "Mentioned during coding discussion",
        confidence: 0.85,
        tags: ["typescript", "language-preference"],
      },
    ]);

    simulateClaudeOutput(mockOutput);

    const session: SessionForExtraction = {
      sessionId: "s1",
      agentId: "agent1",
      agentName: "Pilot",
      turns: [
        { role: "user", content: "Hi, I'm Alice. I really prefer TypeScript over JavaScript." },
        { role: "assistant", content: "Nice to meet you, Alice! TypeScript is a great choice." },
      ],
      timestamp: Date.now(),
    };

    const result = await extractMemories(session);
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("personal");
    expect(result[0].content).toBe("User's name is Alice");
    expect(result[1].category).toBe("preferences");

    // Should also be persisted to store
    const stored = getAllMemories();
    expect(stored).toHaveLength(2);
  });

  it("handles Claude output wrapped in markdown code blocks", async () => {
    const mockOutput = "```json\n" + JSON.stringify([
      {
        category: "projects",
        content: "Working on Cockpit dashboard",
        context: "Main project discussion",
        confidence: 0.9,
        tags: ["cockpit"],
      },
    ]) + "\n```";

    simulateClaudeOutput(mockOutput);

    const session: SessionForExtraction = {
      sessionId: "s1",
      agentId: "agent1",
      agentName: "Pilot",
      turns: [
        { role: "user", content: "I'm working on the Cockpit dashboard" },
        { role: "assistant", content: "Tell me more about it." },
      ],
      timestamp: Date.now(),
    };

    const result = await extractMemories(session);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Working on Cockpit dashboard");
  });

  it("handles empty extraction (nothing worth remembering)", async () => {
    simulateClaudeOutput("[]");

    const session: SessionForExtraction = {
      sessionId: "s1",
      agentId: "agent1",
      agentName: "Pilot",
      turns: [
        { role: "user", content: "What time is it?" },
        { role: "assistant", content: "I don't have access to the current time." },
      ],
      timestamp: Date.now(),
    };

    const result = await extractMemories(session);
    expect(result).toEqual([]);
    expect(getAllMemories()).toHaveLength(0);
  });

  it("filters out invalid categories", async () => {
    const mockOutput = JSON.stringify([
      {
        category: "invalid_category",
        content: "Should be filtered",
        context: "",
        confidence: 0.9,
        tags: [],
      },
      {
        category: "personal",
        content: "Valid memory",
        context: "",
        confidence: 0.9,
        tags: [],
      },
    ]);

    simulateClaudeOutput(mockOutput);

    const session: SessionForExtraction = {
      sessionId: "s1",
      agentId: "agent1",
      agentName: "Pilot",
      turns: [
        { role: "user", content: "test" },
        { role: "assistant", content: "test response" },
      ],
      timestamp: Date.now(),
    };

    const result = await extractMemories(session);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("personal");
  });

  it("handles malformed JSON output gracefully", async () => {
    simulateClaudeOutput("This is not valid JSON at all");

    const session: SessionForExtraction = {
      sessionId: "s1",
      agentId: "agent1",
      agentName: "Pilot",
      turns: [
        { role: "user", content: "test" },
        { role: "assistant", content: "test response" },
      ],
      timestamp: Date.now(),
    };

    const result = await extractMemories(session);
    expect(result).toEqual([]);
  });

  it("handles Claude process failure gracefully", async () => {
    mockStdout.on.mockImplementation(() => {});
    mockStderr.on.mockImplementation((event: string, handler: (chunk: Buffer) => void) => {
      if (event === "data") {
        handler(Buffer.from("Error: model overloaded"));
      }
    });
    mockProc.on.mockImplementation((event: string, handler: (code: number) => void) => {
      if (event === "close") {
        handler(1); // non-zero exit
      }
    });

    const session: SessionForExtraction = {
      sessionId: "s1",
      agentId: "agent1",
      agentName: "Pilot",
      turns: [
        { role: "user", content: "test" },
        { role: "assistant", content: "test response" },
      ],
      timestamp: Date.now(),
    };

    const result = await extractMemories(session);
    expect(result).toEqual([]);
  });

  it("sends existing memories in the prompt for contradiction detection", async () => {
    // Add an existing memory first
    const { addMemory } = await import("../memory/store");
    addMemory({
      category: "personal",
      content: "User lives in San Francisco",
      context: "",
      confidence: 0.9,
      tags: ["location"],
    }, "old_session");

    simulateClaudeOutput("[]");

    const session: SessionForExtraction = {
      sessionId: "s2",
      agentId: "agent1",
      agentName: "Pilot",
      turns: [
        { role: "user", content: "I just moved to New York" },
        { role: "assistant", content: "Welcome to NYC!" },
      ],
      timestamp: Date.now(),
    };

    await extractMemories(session);

    // Check that the prompt written to stdin includes existing memories
    const writtenPrompt = mockStdin.write.mock.calls[0]?.[0] as string;
    expect(writtenPrompt).toContain("User lives in San Francisco");
  });

  it("defaults confidence to 0.5 when not provided", async () => {
    const mockOutput = JSON.stringify([
      {
        category: "personal",
        content: "Some fact",
        context: "",
        tags: [],
        // no confidence field
      },
    ]);

    simulateClaudeOutput(mockOutput);

    const session: SessionForExtraction = {
      sessionId: "s1",
      agentId: "agent1",
      agentName: "Pilot",
      turns: [
        { role: "user", content: "test" },
        { role: "assistant", content: "response" },
      ],
      timestamp: Date.now(),
    };

    const result = await extractMemories(session);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.5);
  });

  it("filters out entries without content", async () => {
    const mockOutput = JSON.stringify([
      {
        category: "personal",
        content: "",
        context: "",
        confidence: 0.9,
        tags: [],
      },
      {
        category: "personal",
        // missing content entirely
        context: "",
        confidence: 0.9,
        tags: [],
      },
      {
        category: "personal",
        content: "Valid fact",
        context: "",
        confidence: 0.9,
        tags: [],
      },
    ]);

    simulateClaudeOutput(mockOutput);

    const session: SessionForExtraction = {
      sessionId: "s1",
      agentId: "agent1",
      agentName: "Pilot",
      turns: [
        { role: "user", content: "test" },
        { role: "assistant", content: "response" },
      ],
      timestamp: Date.now(),
    };

    const result = await extractMemories(session);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Valid fact");
  });
});

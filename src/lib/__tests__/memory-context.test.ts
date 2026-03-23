import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock fs
vi.mock("fs", () => ({
  readFileSync: vi.fn(() => {
    throw new Error("not found");
  }),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

vi.mock("os", () => ({
  homedir: vi.fn(() => "/tmp/test-cockpit"),
}));

// Mock skills to avoid import issues
vi.mock("../skills", () => ({
  buildSkillsPromptSection: vi.fn(() => ""),
}));

import { buildSystemPrompt } from "../context";
import { addMemory, clearAllMemories } from "../memory/store";

describe("Memory Context Integration", () => {
  beforeEach(() => {
    clearAllMemories();
  });

  it("system prompt includes no memory section when no memories", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain("What You Remember About the User");
  });

  it("system prompt includes memory section when memories exist", () => {
    addMemory({
      category: "personal",
      content: "User is a startup founder named Alice",
      context: "First interaction",
      confidence: 0.95,
      tags: ["name", "role"],
    }, "s1");

    addMemory({
      category: "preferences",
      content: "Prefers concise, direct answers",
      context: "User mentioned communication preference",
      confidence: 0.9,
      tags: ["communication"],
    }, "s1");

    const prompt = buildSystemPrompt();
    expect(prompt).toContain("## What You Remember About the User");
    expect(prompt).toContain("User is a startup founder named Alice");
    expect(prompt).toContain("Prefers concise, direct answers");
    expect(prompt).toContain("(personal)");
    expect(prompt).toContain("(preferences)");
  });

  it("system prompt with userMessage does query-relevant retrieval", () => {
    addMemory({
      category: "personal",
      content: "User's name is Alice",
      context: "",
      confidence: 0.95,
      tags: ["name"],
    }, "s1");

    addMemory({
      category: "projects",
      content: "Working on a React dashboard project",
      context: "",
      confidence: 0.9,
      tags: ["react", "dashboard"],
    }, "s1");

    addMemory({
      category: "preferences",
      content: "Prefers Python for data analysis",
      context: "",
      confidence: 0.85,
      tags: ["python", "data"],
    }, "s1");

    // Query about React should surface the React memory
    const prompt = buildSystemPrompt(undefined, undefined, "How should I structure my React components?");
    expect(prompt).toContain("## What You Remember About the User");
    expect(prompt).toContain("React dashboard");
  });

  it("memory section is placed after live data sections", () => {
    addMemory({
      category: "personal",
      content: "Test memory",
      context: "",
      confidence: 0.9,
      tags: [],
    }, "s1");

    const prompt = buildSystemPrompt();

    // Memory section should come after the main context sections
    const memoryIdx = prompt.indexOf("What You Remember About the User");
    const calendarIdx = prompt.indexOf("Today's Calendar");

    expect(memoryIdx).toBeGreaterThan(calendarIdx);
  });

  it("excludes superseded memories from system prompt", () => {
    addMemory({
      category: "personal",
      content: "Lives in San Francisco",
      context: "",
      confidence: 0.9,
      tags: ["location"],
    }, "s1");

    addMemory({
      category: "personal",
      content: "Lives in New York City",
      context: "User moved",
      confidence: 0.95,
      tags: ["location"],
      supersedes_content: "Lives in San Francisco",
    }, "s2");

    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Lives in New York City");
    expect(prompt).not.toContain("Lives in San Francisco");
  });

  it("limits number of memories in system prompt", () => {
    // Add 20 memories
    for (let i = 0; i < 20; i++) {
      addMemory({
        category: "knowledge",
        content: `Technical fact number ${i}`,
        context: "",
        confidence: 0.9,
        tags: [],
      }, "s1");
    }

    const prompt = buildSystemPrompt();
    const memoryLines = prompt.split("\n").filter((l) => l.startsWith("- (knowledge)"));

    // Should be limited (8 recent when no query)
    expect(memoryLines.length).toBeLessThanOrEqual(8);
  });
});

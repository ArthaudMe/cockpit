import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildMemoryPromptSection } from "../memory";
import { addMemory, clearAllMemories } from "../memory/store";

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

describe("buildMemoryPromptSection", () => {
  beforeEach(() => {
    clearAllMemories();
  });

  it("returns empty string when no memories exist", () => {
    const section = buildMemoryPromptSection();
    expect(section).toBe("");
  });

  it("returns empty string with query when no memories exist", () => {
    const section = buildMemoryPromptSection("hello");
    expect(section).toBe("");
  });

  it("includes memories in prompt section", () => {
    addMemory({
      category: "personal",
      content: "User's name is Alice",
      context: "",
      confidence: 0.9,
      tags: ["name"],
    }, "s1");

    addMemory({
      category: "preferences",
      content: "Prefers concise answers",
      context: "",
      confidence: 0.85,
      tags: ["communication"],
    }, "s1");

    const section = buildMemoryPromptSection();

    expect(section).toContain("## What You Remember About the User");
    expect(section).toContain("User's name is Alice");
    expect(section).toContain("Prefers concise answers");
    expect(section).toContain("(personal)");
    expect(section).toContain("(preferences)");
  });

  it("filters memories by query relevance when query provided", () => {
    addMemory({
      category: "personal",
      content: "User is a founder",
      context: "",
      confidence: 0.9,
      tags: ["founder"],
    }, "s1");

    addMemory({
      category: "preferences",
      content: "Prefers Python for data science",
      context: "",
      confidence: 0.85,
      tags: ["python", "data-science"],
    }, "s1");

    // Query about Python should return the Python memory
    const section = buildMemoryPromptSection("Tell me about Python data science");

    expect(section).toContain("## What You Remember About the User");
    expect(section).toContain("Python");
  });

  it("falls back to recent memories when query has no matches", () => {
    addMemory({
      category: "personal",
      content: "User likes coffee",
      context: "",
      confidence: 0.9,
      tags: ["coffee"],
    }, "s1");

    // Query with no matching keywords should fall back to recent
    const section = buildMemoryPromptSection("xyzzy quantum entanglement");
    expect(section).toContain("## What You Remember About the User");
    expect(section).toContain("User likes coffee");
  });

  it("limits to 8 recent memories when no query", () => {
    for (let i = 0; i < 15; i++) {
      addMemory({
        category: "knowledge",
        content: `Fact number ${i}`,
        context: "",
        confidence: 0.9,
        tags: [],
      }, "s1");
    }

    const section = buildMemoryPromptSection();
    // Should have at most 8 lines starting with "- "
    const memoryLines = section.split("\n").filter((l) => l.startsWith("- ("));
    expect(memoryLines.length).toBeLessThanOrEqual(8);
  });
});

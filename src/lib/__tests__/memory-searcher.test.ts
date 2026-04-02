import { describe, it, expect, beforeEach, vi } from "vitest";
import { searchMemoriesFast } from "../memory/searcher";
import {
  addMemory,
  clearAllMemories,
} from "../memory/store";

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

describe("Memory Searcher — Fast (keyword) Search", () => {
  beforeEach(() => {
    clearAllMemories();
  });

  it("returns empty array when no memories exist", () => {
    const results = searchMemoriesFast("anything");
    expect(results).toEqual([]);
  });

  it("finds memories by keyword match in content", () => {
    addMemory({
      category: "personal",
      content: "User is a founder building a SaaS product",
      context: "",
      confidence: 0.9,
      tags: ["founder", "saas"],
    }, "s1");

    addMemory({
      category: "preferences",
      content: "Prefers TypeScript over JavaScript",
      context: "",
      confidence: 0.85,
      tags: ["typescript", "language"],
    }, "s1");

    addMemory({
      category: "projects",
      content: "Working on Cockpit dashboard",
      context: "",
      confidence: 0.9,
      tags: ["cockpit", "dashboard"],
    }, "s1");

    const results = searchMemoriesFast("founder saas");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("founder");
  });

  it("finds memories by tag match", () => {
    addMemory({
      category: "preferences",
      content: "User likes dark mode interfaces",
      context: "",
      confidence: 0.8,
      tags: ["ui", "dark-mode", "design"],
    }, "s1");

    const results = searchMemoriesFast("design preferences");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tags).toContain("design");
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 20; i++) {
      addMemory({
        category: "knowledge",
        content: `Technical fact number ${i} about software engineering`,
        context: "",
        confidence: 0.8,
        tags: ["tech", "software"],
      }, "s1");
    }

    const results = searchMemoriesFast("software engineering", 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("returns empty for queries with no matching words", () => {
    addMemory({
      category: "personal",
      content: "User is a founder",
      context: "",
      confidence: 0.9,
      tags: ["founder"],
    }, "s1");

    const results = searchMemoriesFast("xyzzy quantum entanglement");
    expect(results).toEqual([]);
  });

  it("ignores short words (<=2 chars) in query", () => {
    addMemory({
      category: "personal",
      content: "User is an engineer at Google",
      context: "",
      confidence: 0.9,
      tags: ["engineer", "google"],
    }, "s1");

    // "is" and "an" are <= 2 chars, should be filtered
    // "engineer" should match
    const results = searchMemoriesFast("is an engineer");
    expect(results.length).toBeGreaterThan(0);
  });

  it("scores recent memories higher", () => {
    // Add an old memory
    const old = addMemory({
      category: "personal",
      content: "User works on software projects",
      context: "",
      confidence: 0.9,
      tags: ["software"],
    }, "s1");

    // Manually age it
    (old as any).updatedAt = Date.now() - 48 * 60 * 60 * 1000; // 48 hours ago

    // Add a recent memory with same relevance
    addMemory({
      category: "projects",
      content: "Currently building software for startups",
      context: "",
      confidence: 0.9,
      tags: ["software", "startups"],
    }, "s2");

    const results = searchMemoriesFast("software");
    expect(results.length).toBe(2);
    // Recent one should score higher (recency boost)
    expect(results[0].content).toContain("Currently building");
  });

  it("searches across content, tags, and context", () => {
    addMemory({
      category: "decisions",
      content: "Chose React for frontend",
      context: "During architecture meeting about the new dashboard",
      confidence: 0.9,
      tags: ["react", "frontend", "architecture"],
    }, "s1");

    // Search by context keyword
    const byContext = searchMemoriesFast("architecture meeting");
    expect(byContext.length).toBeGreaterThan(0);

    // Search by tag keyword
    const byTag = searchMemoriesFast("frontend react");
    expect(byTag.length).toBeGreaterThan(0);

    // Search by content keyword
    const byContent = searchMemoriesFast("chose React");
    expect(byContent.length).toBeGreaterThan(0);
  });
});

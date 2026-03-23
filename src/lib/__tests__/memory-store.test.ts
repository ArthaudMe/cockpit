import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getAllMemories,
  getActiveMemories,
  getMemoriesByCategory,
  addMemory,
  addMemories,
  deleteMemory,
  clearAllMemories,
  getMemoryStats,
  getMemoriesAsText,
} from "../memory/store";
import type { ExtractedMemory } from "../memory/types";

// Mock fs to avoid touching real filesystem
vi.mock("fs", () => ({
  readFileSync: vi.fn(() => "[]"),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

vi.mock("os", () => ({
  homedir: vi.fn(() => "/tmp/test-cockpit"),
}));

describe("Memory Store", () => {
  beforeEach(() => {
    clearAllMemories();
  });

  // ─── Basic CRUD ───────────────────────────────────────────────────

  describe("addMemory", () => {
    it("adds a single memory and retrieves it", () => {
      const extracted: ExtractedMemory = {
        category: "personal",
        content: "User's name is Alice",
        context: "User introduced themselves",
        confidence: 0.95,
        tags: ["name", "identity"],
      };

      const memory = addMemory(extracted, "session_1");

      expect(memory.id).toMatch(/^mem_/);
      expect(memory.category).toBe("personal");
      expect(memory.content).toBe("User's name is Alice");
      expect(memory.confidence).toBe(0.95);
      expect(memory.tags).toEqual(["name", "identity"]);
      expect(memory.sourceSession).toBe("session_1");
      expect(memory.createdAt).toBeGreaterThan(0);
      expect(memory.updatedAt).toBeGreaterThan(0);
    });

    it("generates unique IDs for each memory", () => {
      const e: ExtractedMemory = {
        category: "personal",
        content: "fact 1",
        context: "",
        confidence: 0.8,
        tags: [],
      };

      const m1 = addMemory(e, "s1");
      const m2 = addMemory({ ...e, content: "fact 2" }, "s1");

      expect(m1.id).not.toBe(m2.id);
    });
  });

  describe("addMemories (batch)", () => {
    it("adds multiple memories at once", () => {
      const extracted: ExtractedMemory[] = [
        { category: "personal", content: "Name is Bob", context: "", confidence: 0.9, tags: ["name"] },
        { category: "preferences", content: "Prefers dark mode", context: "", confidence: 0.8, tags: ["ui"] },
        { category: "projects", content: "Working on Cockpit", context: "", confidence: 0.95, tags: ["project"] },
      ];

      const results = addMemories(extracted, "session_2");

      expect(results).toHaveLength(3);
      expect(getAllMemories()).toHaveLength(3);
    });
  });

  describe("getAllMemories", () => {
    it("returns empty array when no memories exist", () => {
      expect(getAllMemories()).toEqual([]);
    });

    it("returns all memories including superseded ones", () => {
      addMemory({
        category: "personal",
        content: "Lives in SF",
        context: "",
        confidence: 0.9,
        tags: ["location"],
      }, "s1");

      addMemory({
        category: "personal",
        content: "Lives in NYC",
        context: "User moved",
        confidence: 0.95,
        tags: ["location"],
        supersedes_content: "Lives in SF",
      }, "s2");

      expect(getAllMemories()).toHaveLength(2);
    });
  });

  describe("getActiveMemories", () => {
    it("excludes superseded memories", () => {
      addMemory({
        category: "personal",
        content: "Lives in SF",
        context: "",
        confidence: 0.9,
        tags: ["location"],
      }, "s1");

      addMemory({
        category: "personal",
        content: "Lives in NYC",
        context: "User moved",
        confidence: 0.95,
        tags: ["location"],
        supersedes_content: "Lives in SF",
      }, "s2");

      const active = getActiveMemories();
      expect(active).toHaveLength(1);
      expect(active[0].content).toBe("Lives in NYC");
    });

    it("returns all memories when none are superseded", () => {
      addMemory({
        category: "personal",
        content: "Name is Alice",
        context: "",
        confidence: 0.9,
        tags: ["name"],
      }, "s1");

      addMemory({
        category: "preferences",
        content: "Prefers TypeScript",
        context: "",
        confidence: 0.85,
        tags: ["language"],
      }, "s1");

      expect(getActiveMemories()).toHaveLength(2);
    });
  });

  describe("getMemoriesByCategory", () => {
    it("filters by category", () => {
      addMemory({ category: "personal", content: "Name: Alice", context: "", confidence: 0.9, tags: [] }, "s1");
      addMemory({ category: "projects", content: "Working on Cockpit", context: "", confidence: 0.9, tags: [] }, "s1");
      addMemory({ category: "personal", content: "Role: Founder", context: "", confidence: 0.9, tags: [] }, "s1");

      const personal = getMemoriesByCategory("personal");
      expect(personal).toHaveLength(2);
      expect(personal.every((m) => m.category === "personal")).toBe(true);

      const projects = getMemoriesByCategory("projects");
      expect(projects).toHaveLength(1);
    });

    it("returns empty array for category with no memories", () => {
      addMemory({ category: "personal", content: "test", context: "", confidence: 0.9, tags: [] }, "s1");
      expect(getMemoriesByCategory("temporal")).toEqual([]);
    });
  });

  describe("deleteMemory", () => {
    it("deletes a memory by ID", () => {
      const m = addMemory({ category: "personal", content: "test", context: "", confidence: 0.9, tags: [] }, "s1");
      expect(getAllMemories()).toHaveLength(1);

      const deleted = deleteMemory(m.id);
      expect(deleted).toBe(true);
      expect(getAllMemories()).toHaveLength(0);
    });

    it("returns false for non-existent ID", () => {
      expect(deleteMemory("mem_nonexistent")).toBe(false);
    });
  });

  describe("clearAllMemories", () => {
    it("removes all memories", () => {
      addMemory({ category: "personal", content: "a", context: "", confidence: 0.9, tags: [] }, "s1");
      addMemory({ category: "projects", content: "b", context: "", confidence: 0.9, tags: [] }, "s1");
      addMemory({ category: "decisions", content: "c", context: "", confidence: 0.9, tags: [] }, "s1");

      expect(getAllMemories()).toHaveLength(3);
      clearAllMemories();
      expect(getAllMemories()).toHaveLength(0);
    });
  });

  // ─── Stats ────────────────────────────────────────────────────────

  describe("getMemoryStats", () => {
    it("returns correct stats", () => {
      addMemory({ category: "personal", content: "a", context: "", confidence: 0.9, tags: [] }, "s1");
      addMemory({ category: "personal", content: "b", context: "", confidence: 0.9, tags: [] }, "s1");
      addMemory({ category: "projects", content: "c", context: "", confidence: 0.9, tags: [] }, "s1");

      const stats = getMemoryStats();
      expect(stats.total).toBe(3);
      expect(stats.byCategory.personal).toBe(2);
      expect(stats.byCategory.projects).toBe(1);
      expect(stats.byCategory.decisions).toBe(0);
      expect(stats.oldestMemory).toBeGreaterThan(0);
      expect(stats.newestMemory).toBeGreaterThanOrEqual(stats.oldestMemory!);
    });

    it("returns null timestamps when empty", () => {
      const stats = getMemoryStats();
      expect(stats.total).toBe(0);
      expect(stats.oldestMemory).toBeNull();
      expect(stats.newestMemory).toBeNull();
    });
  });

  // ─── Text Export ──────────────────────────────────────────────────

  describe("getMemoriesAsText", () => {
    it("returns empty string when no memories", () => {
      expect(getMemoriesAsText()).toBe("");
    });

    it("formats memories as searchable text", () => {
      addMemory({
        category: "personal",
        content: "User is a founder",
        context: "introduced themselves",
        confidence: 0.9,
        tags: ["role", "founder"],
      }, "s1");

      const text = getMemoriesAsText();
      expect(text).toContain("personal");
      expect(text).toContain("User is a founder");
      expect(text).toContain("introduced themselves");
      expect(text).toContain("role, founder");
      expect(text).toMatch(/\[mem_[a-f0-9]+\]/);
    });

    it("excludes superseded memories", () => {
      addMemory({
        category: "personal",
        content: "Lives in SF",
        context: "",
        confidence: 0.9,
        tags: ["location"],
      }, "s1");

      addMemory({
        category: "personal",
        content: "Lives in NYC",
        context: "",
        confidence: 0.95,
        tags: ["location"],
        supersedes_content: "Lives in SF",
      }, "s2");

      const text = getMemoriesAsText();
      expect(text).toContain("Lives in NYC");
      expect(text).not.toContain("Lives in SF");
    });
  });

  // ─── Supersedence ─────────────────────────────────────────────────

  describe("supersedence", () => {
    it("links new memory to old via supersedes field", () => {
      const old = addMemory({
        category: "personal",
        content: "User's favorite color is blue",
        context: "",
        confidence: 0.9,
        tags: ["color"],
      }, "s1");

      const updated = addMemory({
        category: "personal",
        content: "User's favorite color is green",
        context: "User changed their mind",
        confidence: 0.95,
        tags: ["color"],
        supersedes_content: "favorite color is blue",
      }, "s2");

      expect(updated.supersedes).toBe(old.id);
    });

    it("does not link when supersedes_content doesn't match", () => {
      addMemory({
        category: "personal",
        content: "Name is Alice",
        context: "",
        confidence: 0.9,
        tags: [],
      }, "s1");

      const m = addMemory({
        category: "personal",
        content: "Lives in NYC",
        context: "",
        confidence: 0.9,
        tags: [],
        supersedes_content: "completely unrelated content that won't match",
      }, "s2");

      expect(m.supersedes).toBeUndefined();
    });
  });
});

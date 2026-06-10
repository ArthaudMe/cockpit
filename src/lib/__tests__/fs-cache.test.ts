import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readJsonCached, invalidateFileCache } from "../fs-cache";
import { writeFileSync, mkdtempSync, rmSync, readFileSync, statSync, utimesSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("fs-cache", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fs-cache-test-"));
    file = join(dir, "config.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns fallback for a missing file", () => {
    expect(readJsonCached(file, { a: 1 })).toEqual({ a: 1 });
  });

  it("reads and parses JSON", () => {
    writeFileSync(file, JSON.stringify({ name: "cockpit" }));
    expect(readJsonCached(file, null)).toEqual({ name: "cockpit" });
  });

  it("returns the same object while the file is unchanged", () => {
    writeFileSync(file, JSON.stringify({ count: 1 }));
    const first = readJsonCached(file, null);
    const second = readJsonCached(file, null);
    expect(second).toBe(first); // cached: identical reference, no re-parse
  });

  it("re-reads after the file changes", () => {
    writeFileSync(file, JSON.stringify({ count: 1 }));
    readJsonCached(file, null);

    writeFileSync(file, JSON.stringify({ count: 2 }));
    // Force a distinct mtime even on coarse-grained filesystems
    const past = new Date(Date.now() + 5000);
    utimesSync(file, past, past);

    expect(readJsonCached<{ count: number } | null>(file, null)?.count).toBe(2);
  });

  it("re-reads after explicit invalidation even if mtime is unchanged", () => {
    writeFileSync(file, JSON.stringify({ count: 1 }));
    readJsonCached(file, null);

    // Rewrite with identical mtime/size characteristics
    const stat = statSync(file);
    writeFileSync(file, JSON.stringify({ count: 9 }));
    utimesSync(file, stat.atime, stat.mtime);

    invalidateFileCache(file);
    expect(readJsonCached<{ count: number } | null>(file, null)?.count).toBe(9);
  });

  it("returns fallback (and drops cache) when the file disappears", () => {
    writeFileSync(file, JSON.stringify({ count: 1 }));
    expect(readJsonCached(file, null)).toEqual({ count: 1 });

    rmSync(file);
    expect(readJsonCached(file, null)).toBeNull();
  });

  it("does not write through to the file", () => {
    writeFileSync(file, JSON.stringify({ items: [1] }));
    readJsonCached(file, null);
    expect(JSON.parse(readFileSync(file, "utf-8"))).toEqual({ items: [1] });
  });
});

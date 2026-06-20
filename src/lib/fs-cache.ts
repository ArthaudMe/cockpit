import { readFileSync, statSync } from "fs";

/**
 * Tiny mtime-keyed read cache for small JSON config/state files under
 * ~/.cockpit. These files are read on hot paths (every datasource poll,
 * every prompt build) but change rarely — re-reading and re-parsing them
 * per call is pure waste.
 *
 * A cached entry is reused as long as the file's mtime and size match.
 * Writers inside this codebase should call `invalidateFileCache(path)`
 * after writing so readers in the same process see changes immediately
 * even within the same mtime tick.
 */

interface CacheEntry {
  mtimeMs: number;
  size: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();

export function readJsonCached<T>(path: string, fallback: T): T {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    // Missing file: drop any stale entry and return the fallback
    cache.delete(path);
    return fallback;
  }

  const hit = cache.get(path);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
    return hit.value as T;
  }

  try {
    const value = JSON.parse(readFileSync(path, "utf-8")) as T;
    cache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, value });
    return value;
  } catch {
    return fallback;
  }
}

export function invalidateFileCache(path: string): void {
  cache.delete(path);
}

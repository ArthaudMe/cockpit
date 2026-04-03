import fs from "fs";
import path from "path";
import os from "os";
import type { DatasourceData } from "./types";

const CACHE_DIR = path.join(os.homedir(), ".cockpit", "cache");
const CACHE_PATH = path.join(CACHE_DIR, "datasources.json");

interface CachedPayload {
  data: DatasourceData;
  cachedAt: number;
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
  }
}

/** Write a successful datasource response to disk cache */
export function writeDatasourceCache(data: DatasourceData): void {
  try {
    ensureCacheDir();
    const payload: CachedPayload = { data, cachedAt: Date.now() };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload), { mode: 0o600 });
  } catch (err) {
    console.error("[cache] Failed to write datasource cache:", err);
  }
}

/** Read the last cached datasource response from disk */
export function readDatasourceCache(): CachedPayload | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as CachedPayload;
  } catch {
    return null;
  }
}

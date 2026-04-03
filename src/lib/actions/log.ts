import fs from "fs";
import path from "path";
import os from "os";
import type { ActionLogEntry } from "./types";

const COCKPIT_DIR = path.join(os.homedir(), ".cockpit");
const LOG_PATH = path.join(COCKPIT_DIR, "action-log.json");

function ensureDir() {
  if (!fs.existsSync(COCKPIT_DIR)) {
    fs.mkdirSync(COCKPIT_DIR, { recursive: true, mode: 0o700 });
  }
}

export function getActionLog(): ActionLogEntry[] {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const raw = fs.readFileSync(LOG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function logAction(entry: ActionLogEntry): void {
  ensureDir();
  const log = getActionLog();
  log.push(entry);
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), { mode: 0o600 });
}

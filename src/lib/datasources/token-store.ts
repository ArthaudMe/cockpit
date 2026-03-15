import fs from "fs";
import path from "path";
import os from "os";
import type { ServiceId, TokenSet } from "./types";

const STORE_DIR = path.join(os.homedir(), ".cockpit");
const STORE_PATH = path.join(STORE_DIR, "tokens.json");

type TokenStore = Partial<Record<ServiceId, TokenSet>>;

function ensureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

function read(): TokenStore {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function write(store: TokenStore) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
}

export function getTokens(service: ServiceId): TokenSet | null {
  const store = read();
  return store[service] ?? null;
}

export function saveTokens(service: ServiceId, tokens: TokenSet) {
  const store = read();
  store[service] = tokens;
  write(store);
}

export function removeTokens(service: ServiceId) {
  const store = read();
  delete store[service];
  write(store);
}

export function getConnectedServices(): ServiceId[] {
  const store = read();
  return Object.keys(store) as ServiceId[];
}

// In-memory state store for OAuth CSRF protection
const pendingStates = new Map<string, { service: ServiceId; createdAt: number }>();

export function createOAuthState(service: ServiceId): string {
  const state = crypto.randomUUID();
  pendingStates.set(state, { service, createdAt: Date.now() });
  // Clean up old states (> 10 min)
  for (const [key, val] of pendingStates) {
    if (Date.now() - val.createdAt > 600_000) pendingStates.delete(key);
  }
  return state;
}

export function consumeOAuthState(state: string): ServiceId | null {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  if (Date.now() - entry.createdAt > 600_000) return null;
  return entry.service;
}

import fs from "fs";
import path from "path";
import os from "os";
import type { ServiceId, TokenSet } from "./types";
import { readJsonCached, invalidateFileCache } from "../fs-cache";

const STORE_DIR = path.join(os.homedir(), ".cockpit");
const STORE_PATH = path.join(STORE_DIR, "tokens.json");

type TokenStore = Partial<Record<ServiceId, TokenSet>>;

function ensureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

// Token reads happen many times per datasource poll (once per connector),
// so they go through the mtime-keyed cache instead of hitting disk each time.
function read(): TokenStore {
  return readJsonCached<TokenStore>(STORE_PATH, {});
}

function write(store: TokenStore) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), {
    mode: 0o600,
  });
  invalidateFileCache(STORE_PATH);
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

// ─── Disabled Services (for auto-detected datasources like Granola) ──

const DISABLED_PATH = path.join(STORE_DIR, "disabled-services.json");

function readDisabled(): ServiceId[] {
  return readJsonCached<ServiceId[]>(DISABLED_PATH, []);
}

function writeDisabled(disabled: ServiceId[]) {
  ensureDir();
  fs.writeFileSync(DISABLED_PATH, JSON.stringify(disabled), { mode: 0o600 });
  invalidateFileCache(DISABLED_PATH);
}

export function disableService(service: ServiceId) {
  const disabled = readDisabled();
  if (!disabled.includes(service)) {
    writeDisabled([...disabled, service]);
  }
}

export function enableService(service: ServiceId) {
  writeDisabled(readDisabled().filter((s) => s !== service));
}

export function isServiceDisabled(service: ServiceId): boolean {
  return readDisabled().includes(service);
}

// File-based state store for OAuth CSRF protection
// (in-memory Map gets cleared by Next.js HMR reloads)
const STATES_PATH = path.join(STORE_DIR, "oauth-states.json");

type StateEntry = { service: ServiceId; createdAt: number; codeVerifier?: string };
type StateStore = Record<string, StateEntry>;

function readStates(): StateStore {
  try {
    if (!fs.existsSync(STATES_PATH)) return {};
    return JSON.parse(fs.readFileSync(STATES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeStates(states: StateStore) {
  ensureDir();
  fs.writeFileSync(STATES_PATH, JSON.stringify(states, null, 2), {
    mode: 0o600,
  });
}

export function createOAuthState(service: ServiceId, codeVerifier?: string): string {
  const state = crypto.randomUUID();
  const states = readStates();
  states[state] = { service, createdAt: Date.now(), codeVerifier };
  // Clean up old states (> 10 min)
  for (const key of Object.keys(states)) {
    if (Date.now() - states[key].createdAt > 600_000) delete states[key];
  }
  writeStates(states);
  return state;
}

export function consumeOAuthState(state: string): { service: ServiceId; codeVerifier?: string } | null {
  const states = readStates();
  const entry = states[state];
  if (!entry) return null;
  delete states[state];
  writeStates(states);
  if (Date.now() - entry.createdAt > 600_000) return null;
  return { service: entry.service, codeVerifier: entry.codeVerifier };
}

// File-based state for Composio hosted OAuth callbacks. Direct OAuth uses the
// service state above; Composio returns a connected_account_id that must match
// the link we just created before we persist it.
const COMPOSIO_STATES_PATH = path.join(STORE_DIR, "composio-oauth-states.json");

type ComposioToolkit = "googlecalendar" | "gmail";
type ComposioStateEntry = {
  toolkit: ComposioToolkit;
  connectionId: string;
  createdAt: number;
};
type ComposioStateStore = Record<string, ComposioStateEntry>;

function readComposioStates(): ComposioStateStore {
  try {
    if (!fs.existsSync(COMPOSIO_STATES_PATH)) return {};
    return JSON.parse(fs.readFileSync(COMPOSIO_STATES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeComposioStates(states: ComposioStateStore) {
  ensureDir();
  fs.writeFileSync(COMPOSIO_STATES_PATH, JSON.stringify(states, null, 2), {
    mode: 0o600,
  });
}

export function createComposioOAuthState(
  toolkit: ComposioToolkit,
  connectionId: string,
  state = crypto.randomUUID(),
): string {
  const states = readComposioStates();
  states[state] = { toolkit, connectionId, createdAt: Date.now() };
  for (const key of Object.keys(states)) {
    if (Date.now() - states[key].createdAt > 600_000) delete states[key];
  }
  writeComposioStates(states);
  return state;
}

export function consumeComposioOAuthState(
  state: string,
): { toolkit: ComposioToolkit; connectionId: string } | null {
  const states = readComposioStates();
  const entry = states[state];
  if (!entry) return null;
  delete states[state];
  writeComposioStates(states);
  if (Date.now() - entry.createdAt > 600_000) return null;
  return { toolkit: entry.toolkit, connectionId: entry.connectionId };
}

// ─── Composio connection tracking ────────────────────────────────
// Stores Composio connected-account IDs for Google toolkits.

const COMPOSIO_PATH = path.join(STORE_DIR, "composio-connections.json");

type ComposioConnections = {
  googlecalendar?: string; // connected_account_id
  gmail?: string;
};

function readComposio(): ComposioConnections {
  return readJsonCached<ComposioConnections>(COMPOSIO_PATH, {});
}

function writeComposio(conns: ComposioConnections) {
  ensureDir();
  fs.writeFileSync(COMPOSIO_PATH, JSON.stringify(conns, null, 2), {
    mode: 0o600,
  });
  invalidateFileCache(COMPOSIO_PATH);
}

export function saveComposioConnection(
  toolkit: "googlecalendar" | "gmail",
  connectionId: string,
) {
  const conns = readComposio();
  conns[toolkit] = connectionId;
  writeComposio(conns);
}

export function getComposioConnection(
  toolkit: "googlecalendar" | "gmail",
): string | null {
  return readComposio()[toolkit] ?? null;
}

export function getComposioConnections(): ComposioConnections {
  return readComposio();
}

export function removeComposioConnections() {
  writeComposio({});
}

export function isGoogleConnectedViaComposio(): boolean {
  const conns = readComposio();
  return !!(conns.googlecalendar || conns.gmail);
}

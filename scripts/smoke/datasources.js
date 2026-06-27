#!/usr/bin/env node

const { existsSync, readFileSync } = require("fs");
const { createServer } = require("net");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const args = new Set(process.argv.slice(2));
const startServer = args.has("--start");
const servicesArg = process.argv.find((arg) => arg.startsWith("--services="));
const services = (servicesArg ? servicesArg.slice("--services=".length).split(",") : [
  "google",
  "slack",
  "linear",
  "github",
  "notion",
])
  .map((service) => service.trim())
  .filter(Boolean);

function log(message) {
  console.log(`[smoke:datasources] ${message}`);
}

function fail(message) {
  console.error(`[smoke:datasources] ${message}`);
  process.exit(1);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const env = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(baseUrl, headers) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      const res = await fetch(`${baseUrl}/api/status`, { headers });
      if (res.status !== 503) return;
    } catch {
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`Server did not become ready at ${baseUrl}`);
}

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

async function assertGet(baseUrl, endpoint, headers) {
  const res = await fetch(`${baseUrl}${endpoint}`, { headers });
  const data = await readJson(res);
  if (!res.ok) {
    fail(`${endpoint} returned ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  log(`${endpoint}: ${res.status}`);
}

async function assertConnect(baseUrl, service, headers) {
  const res = await fetch(`${baseUrl}/api/datasources/connect?service=${service}`, { headers });
  const data = await readJson(res);
  const url = typeof data.url === "string" ? data.url : "";
  if (!res.ok || !/^https?:\/\//.test(url)) {
    fail(`connect ${service} failed (${res.status}): ${JSON.stringify(data).slice(0, 500)}`);
  }
  log(`connect ${service}: ${res.status} provider URL ok`);
}

async function main() {
  let child = null;
  const token = process.env.SMOKE_API_TOKEN || "smoke-token";
  const headers = { "X-Cockpit-Token": token };
  let baseUrl = process.env.SMOKE_BASE_URL || "";

  if (startServer) {
    const serverJs = path.join(root, ".next", "standalone", "server.js");
    if (!existsSync(serverJs)) {
      fail(".next/standalone/server.js not found. Run `pnpm build && node scripts/prepare-standalone.js` first.");
    }

    const port = Number(process.env.SMOKE_PORT || await getFreePort());
    baseUrl = `http://127.0.0.1:${port}`;
    const env = {
      ...process.env,
      ...loadEnvFile(path.join(root, ".env.local")),
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      COCKPIT_API_TOKEN: token,
    };

    child = spawn(process.execPath, [serverJs], {
      cwd: path.dirname(serverJs),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => process.stdout.write(`[smoke:server] ${data}`));
    child.stderr.on("data", (data) => process.stderr.write(`[smoke:server] ${data}`));
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        console.error(`[smoke:datasources] server exited with ${code}`);
      }
    });
  }

  if (!baseUrl) fail("Set SMOKE_BASE_URL or pass --start.");

  try {
    await waitForServer(baseUrl, headers);
    for (const endpoint of ["/api/status", "/api/backends", "/api/datasources", "/api/datasources/data"]) {
      await assertGet(baseUrl, endpoint, headers);
    }
    for (const service of services) {
      await assertConnect(baseUrl, service, headers);
    }
    log("ok");
  } finally {
    if (child) {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
    }
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));

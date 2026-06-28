#!/usr/bin/env node

const { spawn } = require("child_process");
const { existsSync } = require("fs");
const net = require("net");
const path = require("path");

const TOKEN = "smoke-token";
const HOST = "127.0.0.1";
const SERVICES = ["google", "slack", "linear", "github", "notion"];

function fail(message) {
  console.error(`[smoke:datasources] ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[smoke:datasources] ${message}`);
}

function parseArgs() {
  return new Set(process.argv.slice(2));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function requestJson(port, route) {
  const res = await fetch(`http://${HOST}:${port}${route}`, {
    headers: { "X-Cockpit-Token": TOKEN },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { res, data };
}

async function waitForServer(port, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(`server exited early with ${child.exitCode}`);
    }
    try {
      const { res } = await requestJson(port, "/api/status");
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail("server did not become ready");
}

function startServer(port) {
  const serverJs = path.resolve(".next/standalone/server.js");
  if (!existsSync(serverJs)) {
    fail(`standalone server missing at ${serverJs}; run next build and prepare-standalone first`);
  }

  const child = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    env: {
      ...process.env,
      HOSTNAME: HOST,
      PORT: String(port),
      NODE_ENV: "production",
      COCKPIT_API_TOKEN: TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => process.stdout.write(`[smoke:server] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[smoke:server:err] ${data}`));
  return child;
}

async function checkRoute(port, route) {
  const { res, data } = await requestJson(port, route);
  if (!res.ok) {
    fail(`${route} returned HTTP ${res.status}: ${data.error || "no error detail"}`);
  }
  log(`${route}: ok`);
  return data;
}

async function checkConnect(port, service) {
  const { res, data } = await requestJson(port, `/api/datasources/connect?service=${service}`);
  if (!res.ok) {
    fail(`${service} connect returned HTTP ${res.status}: ${data.error || "no error detail"}`);
  }
  if (!data.url || !/^https?:\/\//.test(data.url)) {
    fail(`${service} connect did not return a provider URL`);
  }
  if (service === "google") {
    const host = new URL(data.url).hostname.toLowerCase();
    const composioHost =
      host === "composio.dev" ||
      host.endsWith(".composio.dev") ||
      host === "composio.com" ||
      host.endsWith(".composio.com");
    if (!composioHost) {
      fail(`google connect returned ${host}; expected Composio hosted OAuth`);
    }
  }
  log(`connect ${service}: provider URL ok`);
}

async function main() {
  const args = parseArgs();
  const shouldStart = args.has("--start");
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  const port = portArg ? Number(portArg.slice("--port=".length)) : await getFreePort();

  let child;
  if (shouldStart) {
    child = startServer(port);
    await waitForServer(port, child);
  }

  try {
    await checkRoute(port, "/api/status");
    await checkRoute(port, "/api/backends");
    await checkRoute(port, "/api/datasources");
    await checkRoute(port, "/api/datasources/data");
    for (const service of SERVICES) {
      await checkConnect(port, service);
    }
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : "unexpected failure");
});

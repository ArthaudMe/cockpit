#!/usr/bin/env node

const { existsSync } = require("fs");
const net = require("net");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const HOST = "127.0.0.1";
const TOKEN = "packaged-smoke-token";
const APP_PATH = path.resolve("dist-electron/mac-arm64/Cockpit.app");
const RESOURCES = path.join(APP_PATH, "Contents", "Resources");
const ASAR_PATH = path.join(RESOURCES, "app.asar");
const SERVER_JS = path.join(RESOURCES, "app.asar.unpacked", ".next", "standalone", "server.js");

function fail(message) {
  console.error(`[smoke:packaged] ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[smoke:packaged] ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    encoding: "utf-8",
    ...options,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} exited with ${result.status}`);
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

async function requestStatus(port) {
  const res = await fetch(`http://${HOST}:${port}/api/status`, {
    headers: { "X-Cockpit-Token": TOKEN },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function waitForServer(port, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`standalone server exited early with ${child.exitCode}`);
    try {
      await requestStatus(port);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  fail("packaged standalone server did not become ready");
}

async function smokeStandalone() {
  const port = await getFreePort();
  const child = spawn(process.execPath, [SERVER_JS], {
    cwd: path.dirname(SERVER_JS),
    env: {
      ...process.env,
      HOSTNAME: HOST,
      PORT: String(port),
      NODE_ENV: "production",
      COCKPIT_API_TOKEN: TOKEN,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => process.stdout.write(`[smoke:packaged:server] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[smoke:packaged:server:err] ${data}`));

  try {
    await waitForServer(port, child);
    log("packaged standalone API ready");
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
  }
}

async function main() {
  if (process.platform !== "darwin") {
    fail("packaged mac smoke must run on macOS");
  }

  if (!existsSync(APP_PATH)) fail(`missing app bundle at ${APP_PATH}`);
  if (!existsSync(ASAR_PATH)) fail(`missing app.asar at ${ASAR_PATH}`);
  if (!existsSync(SERVER_JS)) {
    fail(`missing unpacked standalone server at ${SERVER_JS}; check build.asarUnpack`);
  }
  log("package layout ok");

  run("codesign", ["--verify", "--deep", "--strict", APP_PATH]);
  log("codesign verification ok");

  await smokeStandalone();

  if (process.argv.includes("--launch")) {
    run("open", ["-n", APP_PATH]);
    log("launched app");
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : "unexpected failure");
});

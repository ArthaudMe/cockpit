#!/usr/bin/env node

const { existsSync, readFileSync } = require("fs");
const { createServer } = require("net");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const args = new Set(process.argv.slice(2));
const launchElectron = args.has("--launch");
const appArg = process.argv.find((arg) => arg.startsWith("--app="));
const appPath = appArg
  ? path.resolve(appArg.slice("--app=".length))
  : path.join(root, "dist-electron", "mac-arm64", "Cockpit.app");

function log(message) {
  console.log(`[smoke:packaged] ${message}`);
}

function fail(message) {
  console.error(`[smoke:packaged] ${message}`);
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

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8" });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    fail(`${command} ${commandArgs.join(" ")} failed:\n${output}`);
  }
  return result.stdout;
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

async function waitForApi(baseUrl, token) {
  const started = Date.now();
  while (Date.now() - started < 20_000) {
    try {
      const res = await fetch(`${baseUrl}/api/status`, {
        headers: { "X-Cockpit-Token": token },
      });
      if (res.ok) return;
    } catch {
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`Packaged standalone server did not become ready at ${baseUrl}`);
}

async function smokeStandalone(serverJs) {
  const token = "packaged-smoke-token";
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    env: {
      ...process.env,
      ...loadEnvFile(path.join(root, ".env.local")),
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      COCKPIT_API_TOKEN: token,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => process.stdout.write(`[smoke:standalone] ${data}`));
  child.stderr.on("data", (data) => process.stderr.write(`[smoke:standalone] ${data}`));

  try {
    await waitForApi(baseUrl, token);
    log("packaged standalone API ready");
  } finally {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 1000).unref();
  }
}

async function smokeElectronLaunch() {
  const executable = path.join(appPath, "Contents", "MacOS", "Cockpit");
  if (!existsSync(executable)) fail(`Executable missing: ${executable}`);

  const child = spawn(executable, [], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data.toString();
    process.stdout.write(`[smoke:electron] ${data}`);
  });
  child.stderr.on("data", (data) => {
    output += data.toString();
    process.stderr.write(`[smoke:electron] ${data}`);
  });

  const started = Date.now();
  try {
    while (Date.now() - started < 30_000) {
      if (output.includes("✓ Ready") || output.includes("Ready in")) {
        log("Electron packaged app launched and server became ready");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    fail("Electron launch did not report server readiness within 30s");
  } finally {
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 1000).unref();
  }
}

async function main() {
  if (process.platform !== "darwin") {
    fail("packaged mac smoke must run on macOS");
  }
  if (!existsSync(appPath)) fail(`App bundle not found: ${appPath}`);

  const resources = path.join(appPath, "Contents", "Resources");
  const asar = path.join(resources, "app.asar");
  const serverJs = path.join(resources, "app.asar.unpacked", ".next", "standalone", "server.js");
  if (!existsSync(asar)) fail(`app.asar missing: ${asar}`);
  if (!existsSync(serverJs)) {
    fail(`Unpacked standalone server missing: ${serverJs}. Check package.json build.asarUnpack.`);
  }
  log("package layout ok");

  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  log("codesign verification ok");

  await smokeStandalone(serverJs);
  if (launchElectron) await smokeElectronLaunch();

  log("ok");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));

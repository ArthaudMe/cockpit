#!/usr/bin/env node

const { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } = require("fs");
const { tmpdir } = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const RELEASE_DIR = path.resolve(process.cwd(), "dist-electron");
const APP_BUNDLE_NAME = process.env.COCKPIT_APP_BUNDLE || "Cockpit.app";

const args = process.argv.slice(2);
const skipSubmit = args.includes("--skip-submit");

function readArg(name) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function log(message) {
  console.log(`[release] ${message}`);
}

function fail(message) {
  console.error(`[release] ${message}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  log(`${command} ${commandArgs.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    encoding: "utf-8",
    ...options,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} exited with ${result.status}`);
}

function listDmgs() {
  if (!existsSync(RELEASE_DIR)) fail(`Release directory not found: ${RELEASE_DIR}`);
  return readdirSync(RELEASE_DIR)
    .filter((file) => file.endsWith(".dmg"))
    .map((file) => path.join(RELEASE_DIR, file));
}

function buildNotaryArgs() {
  const apiKey = process.env.APPLE_API_KEY || process.env.APPLE_API_KEY_CONTENT;
  const apiKeyId = process.env.APPLE_API_KEY_ID;
  const apiIssuer = process.env.APPLE_API_ISSUER;

  if (apiKey && apiKeyId && apiIssuer) {
    let keyPath = apiKey;
    if (apiKey.includes("BEGIN PRIVATE KEY") || apiKey.length > 500) {
      keyPath = path.join(tmpdir(), `cockpit_apple_api_key_${Date.now()}.p8`);
      writeFileSync(keyPath, apiKey);
      temporaryFiles.push(keyPath);
    }
    return ["--key", keyPath, "--key-id", apiKeyId, "--issuer", apiIssuer];
  }

  if (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) {
    return [
      "--apple-id", process.env.APPLE_ID,
      "--password", process.env.APPLE_APP_SPECIFIC_PASSWORD,
      "--team-id", process.env.APPLE_TEAM_ID,
    ];
  }

  const profile =
    readArg("--keychain-profile") ||
    process.env.COCKPIT_NOTARY_PROFILE ||
    process.env.APPLE_NOTARY_PROFILE ||
    "cockpit-notary";
  return ["--keychain-profile", profile];
}

function findMountedApp(mountPoint) {
  const direct = path.join(mountPoint, APP_BUNDLE_NAME);
  if (existsSync(direct)) return direct;
  const app = readdirSync(mountPoint).find((entry) => entry.endsWith(".app"));
  return app ? path.join(mountPoint, app) : null;
}

function verifyMountedApp(dmg) {
  const mountPoint = mkdtempSync(path.join(tmpdir(), "cockpit-dmg-"));
  try {
    run("hdiutil", ["attach", dmg, "-mountpoint", mountPoint, "-nobrowse", "-quiet"]);
    const appPath = findMountedApp(mountPoint);
    if (!appPath) fail(`No .app bundle found inside ${dmg}`);
    run("spctl", ["-a", "-vv", "--type", "execute", appPath]);
  } finally {
    spawnSync("hdiutil", ["detach", mountPoint, "-quiet"], { stdio: "ignore" });
    rmSync(mountPoint, { recursive: true, force: true });
  }
}

if (process.platform !== "darwin") {
  fail("macOS notarization must run on darwin");
}

const temporaryFiles = [];
const dmgs = listDmgs();
if (dmgs.length === 0) fail(`No DMG files found in ${RELEASE_DIR}`);

try {
  const notaryArgs = buildNotaryArgs();

  for (const dmg of dmgs) {
    if (!skipSubmit) {
      run("xcrun", ["notarytool", "submit", dmg, "--wait", ...notaryArgs]);
    } else {
      log(`Skipping notary submission for ${path.basename(dmg)}`);
    }

    run("xcrun", ["stapler", "staple", dmg]);
    run("xcrun", ["stapler", "validate", dmg]);
    verifyMountedApp(dmg);
    log(`Verified ${path.basename(dmg)}`);
  }
} finally {
  for (const file of temporaryFiles) {
    rmSync(file, { force: true });
  }
}

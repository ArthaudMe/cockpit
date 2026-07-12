#!/usr/bin/env node

const { existsSync, readdirSync, readFileSync, copyFileSync } = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const releaseDir = path.join(root, "dist-electron");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8"));
const expectedTag = `v${pkg.version}`;
const tag = process.env.RELEASE_TAG || expectedTag;

function log(message) {
  console.log(`[release] ${message}`);
}

function fail(message) {
  console.error(`[release] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  log(`${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} exited with ${result.status}`);
}

function status(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return result.status ?? 1;
}

// Guard: the release tag must match package.json version so we never publish
// artifacts under a tag that disagrees with the built app's version.
if (tag !== expectedTag) {
  fail(
    `Release tag mismatch: RELEASE_TAG="${tag}" but package.json version is ` +
      `"${pkg.version}" (expected "${expectedTag}"). Bump the version or fix ` +
      `RELEASE_TAG before publishing.`
  );
}

if (!existsSync(releaseDir)) fail(`Release directory not found: ${releaseDir}`);

const artifacts = readdirSync(releaseDir)
  .filter((file) =>
    file.endsWith(".dmg") ||
    file.endsWith(".zip") ||
    file.endsWith(".yml") ||
    file.endsWith(".blockmap")
  )
  .map((file) => path.join(releaseDir, file));

if (artifacts.length === 0) fail(`No publishable artifacts found in ${releaseDir}`);

// Build a stable-named alias of the arm64 dmg so the landing page can link to
// a version-independent filename (Cockpit-arm64.dmg) across releases.
const arm64Dmg = artifacts.find(
  (file) => file.endsWith(".dmg") && path.basename(file).includes("arm64")
);
if (arm64Dmg) {
  const alias = path.join(releaseDir, "Cockpit-arm64.dmg");
  if (path.resolve(alias) !== path.resolve(arm64Dmg)) {
    copyFileSync(arm64Dmg, alias);
    artifacts.push(alias);
    log(`Created stable alias ${path.basename(alias)} from ${path.basename(arm64Dmg)}`);
  }
} else {
  log("Warning: no arm64 .dmg found; skipping Cockpit-arm64.dmg alias");
}

// TODO: consider `gh release create --draft` then publish after asset upload
// so partially-uploaded releases are never visible. Skipped for now to keep
// the flow simple and avoid a two-phase publish.
if (status("gh", ["release", "view", tag]) !== 0) {
  run("gh", ["release", "create", tag, "--title", tag, "--notes", `Cockpit ${tag}`]);
}

run("gh", ["release", "upload", tag, ...artifacts, "--clobber"]);
log(`Uploaded ${artifacts.length} artifact(s) to ${tag}`);

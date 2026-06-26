#!/usr/bin/env node

const { existsSync, readdirSync, readFileSync } = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd();
const releaseDir = path.join(root, "dist-electron");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8"));
const tag = process.env.RELEASE_TAG || `v${pkg.version}`;

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

if (status("gh", ["release", "view", tag]) !== 0) {
  run("gh", ["release", "create", tag, "--title", tag, "--notes", `Cockpit ${tag}`]);
}

run("gh", ["release", "upload", tag, ...artifacts, "--clobber"]);
log(`Uploaded ${artifacts.length} artifact(s) to ${tag}`);

#!/usr/bin/env node

/**
 * Verifies that the deployed OAuth proxy is reachable, authenticated, and has
 * provider credentials configured before we build a release.
 */

const fs = require("fs");

const DEFAULT_SERVICES = ["github", "linear", "slack", "notion"];

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;

  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function fail(message) {
  console.error(`[oauth:check] ${message}`);
  process.exit(1);
}

function parseServices() {
  const arg = process.argv.find((item) => item.startsWith("--services="));
  if (!arg) return DEFAULT_SERVICES;
  return arg
    .slice("--services=".length)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function postJson(url, secret, service) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        service,
        grant_type: "preflight",
      }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      data = { error: `non-JSON response (${res.status})` };
    }

    if (!res.ok || data.error || data.ok !== true) {
      const detail = data.error_description || data.error || `HTTP ${res.status}`;
      return { ok: false, detail };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "request failed" };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  loadEnvFile(".env.local");

  const rawUrl = process.env.OAUTH_PROXY_URL;
  const secret = process.env.OAUTH_PROXY_SECRET;

  if (!rawUrl) fail("OAUTH_PROXY_URL is not set.");
  if (!secret) fail("OAUTH_PROXY_SECRET is not set.");

  const endpoint = `${rawUrl.replace(/\/+$/, "")}/api/oauth/token`;
  const services = parseServices();
  const results = await Promise.all(
    services.map(async (service) => ({
      service,
      result: await postJson(endpoint, secret, service),
    })),
  );

  const failures = results.filter(({ result }) => !result.ok);
  for (const { service, result } of results) {
    const status = result.ok ? "ok" : `failed: ${result.detail}`;
    console.log(`[oauth:check] ${service}: ${status}`);
  }

  if (failures.length > 0) {
    fail("OAuth proxy preflight failed. Fix Vercel proxy env/deploy before releasing.");
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : "unexpected failure");
});

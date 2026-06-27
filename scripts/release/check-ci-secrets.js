#!/usr/bin/env node

/**
 * Fast-fails the release workflow when required GitHub environment secrets are
 * absent. GitHub masks secret values but expands missing secrets to empty
 * strings, so checking here gives a concrete error before signing/notarization.
 */

const REQUIRED = [
  "CERTIFICATE_P12",
  "CERTIFICATE_PASSWORD",
  "OAUTH_PROXY_URL",
  "OAUTH_PROXY_SECRET",
];

const APPLE_ID_GROUP = [
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];

const APPLE_API_GROUP = [
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
];

function isSet(name) {
  return Boolean((process.env[name] || "").trim());
}

function fail(message) {
  console.error(`[release:secrets] ${message}`);
  process.exit(1);
}

const missing = REQUIRED.filter((name) => !isSet(name));
if (missing.length > 0) {
  fail(`Missing required release secret(s): ${missing.join(", ")}`);
}

const hasAppleIdCreds = APPLE_ID_GROUP.every(isSet);
const hasAppleApiCreds = APPLE_API_GROUP.every(isSet);

if (!hasAppleIdCreds && !hasAppleApiCreds) {
  fail(
    "Missing Apple notarization credentials. Set either APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID or APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER."
  );
}

console.log("[release:secrets] ok");

#!/usr/bin/env node

function present(name) {
  return Boolean(process.env[name] && process.env[name].trim());
}

function missing(names) {
  return names.filter((name) => !present(name));
}

const required = [
  "CERTIFICATE_P12",
  "CERTIFICATE_PASSWORD",
  "OAUTH_PROXY_URL",
  "OAUTH_PROXY_SECRET",
];

const appleIdGroup = [
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];

const apiKeyGroup = [
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
];

const missingRequired = missing(required);
const hasAppleIdGroup = missing(appleIdGroup).length === 0;
const hasApiKeyGroup = missing(apiKeyGroup).length === 0;

if (missingRequired.length > 0 || (!hasAppleIdGroup && !hasApiKeyGroup)) {
  for (const name of missingRequired) {
    console.error(`[release:check-secrets] missing ${name}`);
  }

  if (!hasAppleIdGroup && !hasApiKeyGroup) {
    const missingAppleId = missing(appleIdGroup);
    const missingApiKey = missing(apiKeyGroup);
    console.error(
      `[release:check-secrets] missing notarization credentials: set either ${appleIdGroup.join(", ")} or ${apiKeyGroup.join(", ")}`,
    );
    console.error(
      `[release:check-secrets] Apple ID group missing: ${missingAppleId.join(", ") || "none"}`,
    );
    console.error(
      `[release:check-secrets] App Store Connect API key group missing: ${missingApiKey.join(", ") || "none"}`,
    );
  }

  process.exit(1);
}

console.log("[release:check-secrets] release secrets present");

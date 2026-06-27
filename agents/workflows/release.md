# Release Workflow

## Release-Critical Rule

Do not publish a macOS DMG unless all of these pass:

1. Code signing completes.
2. Notarization completes.
3. Stapling succeeds.
4. Stapler validates the DMG ticket.
5. Gatekeeper accepts the app mounted from the DMG.

Users should never need `xattr -cr /Applications/Cockpit.app` for a normal
website download.

## Local macOS Release

CI is the release authority. Local macOS release commands are for debugging the
same gate, not for publishing public downloads from a developer machine.

Prerequisites:

- Developer ID Application certificate available in the macOS keychain.
- `OAUTH_PROXY_URL` and `OAUTH_PROXY_SECRET` set for production builds. These
  are inlined by `next.config.ts`; if either is blank, OAuth proxy connections
  are disabled in that build.
  `pnpm release:mac` runs `pnpm oauth:check` first, which verifies the deployed
  Vercel proxy accepts the shared secret and has credentials for GitHub, Linear,
  Slack, and Notion.
- Apple notarization credentials available either as:
  - keychain profile `cockpit-notary`, or
  - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`, or
  - `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.

Build, sign, notarize, staple, and verify:

```bash
pnpm release:mac
```

The script writes artifacts under `dist-electron/`.

For a fast local preflight before pushing release work:

```bash
pnpm release:verify
```

For a signed packaged app layout/startup smoke after `electron-builder`:

```bash
pnpm smoke:packaged
```

## CI Release

Use the GitHub Actions workflow:

```bash
gh workflow run release-mac.yml --ref master -f tag=v0.1.0
```

The workflow builds the DMG without publishing, notarizes and verifies it, then
uploads the verified artifacts to the requested GitHub release.

Required GitHub environment secrets:

- `CERTIFICATE_P12`
- `CERTIFICATE_PASSWORD`
- `OAUTH_PROXY_URL`
- `OAUTH_PROXY_SECRET`
- either `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, or
  `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`

The workflow runs `pnpm release:check-secrets` before importing the signing
certificate so missing secrets fail with an explicit message. If this step
fails, fix GitHub environment secrets rather than trying to recover release
credentials on a local machine.

## Manual Verification

For the deployed OAuth proxy:

```bash
pnpm oauth:check
```

For an existing DMG:

```bash
node scripts/release/notarize-mac.js --skip-submit
```

This validates stapling and Gatekeeper without submitting to Apple again.

## Files

- `package.json` - Electron builder config and release scripts.
- `scripts/release/check-oauth-proxy.js` - Vercel OAuth proxy preflight.
- `scripts/release/check-ci-secrets.js` - CI release secret preflight.
- `scripts/release/notarize-mac.js` - Notarization, stapling, and Gatekeeper checks.
- `scripts/smoke/datasources.js` - protected API and datasource connect smoke.
- `scripts/smoke/packaged-mac.js` - signed packaged app layout/startup smoke.
- `.github/workflows/release-mac.yml` - Mac release workflow.

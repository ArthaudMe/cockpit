/**
 * OAuth client IDs (public, safe to embed in the app).
 *
 * Client secrets are NEVER here — they live in the OAuth proxy (proxy/).
 * In development, env vars override these defaults.
 */

const CREDENTIALS = {
  GOOGLE_CLIENT_ID:
    process.env.GOOGLE_CLIENT_ID ||
    "434600410325-adrugi23q2vdphgrt46a0s36jb65osjq.apps.googleusercontent.com",

  GITHUB_CLIENT_ID:
    process.env.GITHUB_CLIENT_ID ||
    "Ov23liLm2ShGLryCdyTh",
  LINEAR_CLIENT_ID:
    process.env.LINEAR_CLIENT_ID ||
    "5379121880695621fff4dcf1460dc4bb",
  SLACK_CLIENT_ID:
    process.env.SLACK_CLIENT_ID ||
    "8979473381190.10997692866610",
  NOTION_CLIENT_ID:
    process.env.NOTION_CLIENT_ID ||
    "324d872b-594c-813b-8d4e-0037a19cf82a",
} as const;

export default CREDENTIALS;

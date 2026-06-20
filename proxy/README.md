# Cockpit OAuth Proxy

Tiny Vercel serverless function that holds OAuth client secrets so they never ship in the desktop app.

## How it works

```
User clicks "Connect Google" in Cockpit
  -> Cockpit opens Google OAuth page (client_id is public, safe)
  -> User authorizes
  -> Google redirects back with auth code
  -> Cockpit sends auth code to THIS proxy
  -> Proxy adds the client_secret and exchanges code for tokens
  -> Proxy returns tokens to Cockpit
```

## Deploy

```bash
cd proxy
vercel --prod
```

Then set environment variables in the Vercel dashboard:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
- `LINEAR_CLIENT_ID` / `LINEAR_CLIENT_SECRET`
- `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`
- `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET`
- `PROXY_SECRET` — shared secret (generate: `openssl rand -base64 32`)

## API

### `POST /api/oauth/token`

**Headers:** `Authorization: Bearer <PROXY_SECRET>`

**Body (JSON):**
```json
{
  "service": "google",
  "grant_type": "authorization_code",
  "code": "4/0XXXXX",
  "redirect_uri": "http://localhost:3000/api/datasources/callback"
}
```

Or for refresh:
```json
{
  "service": "google",
  "grant_type": "refresh_token",
  "refresh_token": "1//0XXXXX"
}
```

**Response:** Forwards the provider's token response as-is.

import type { OAuthConfig, TokenSet, NotionPage } from "../types";
import { getTokens } from "../token-store";

export const NOTION_OAUTH: OAuthConfig = {
  authUrl: "https://api.notion.com/v1/oauth/authorize",
  tokenUrl: "https://api.notion.com/v1/oauth/token",
  scopes: [], // Notion doesn't use scopes in the traditional sense
  clientIdEnvVar: "NOTION_CLIENT_ID",
  clientSecretEnvVar: "NOTION_CLIENT_SECRET",
};

export function getNotionAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.NOTION_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    owner: "user",
    state,
  });
  return `${NOTION_OAUTH.authUrl}?${params}`;
}

export async function exchangeNotionCode(
  code: string,
  redirectUri: string
): Promise<TokenSet> {
  const credentials = Buffer.from(
    `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(NOTION_OAUTH.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error || "Notion OAuth failed");

  return {
    access_token: data.access_token,
    token_type: data.token_type,
    // Notion tokens don't expire
  };
}

function getNotionTokens(): TokenSet | null {
  return getTokens("notion");
}

export async function fetchNotionPages(): Promise<NotionPage[]> {
  const tokens = getNotionTokens();
  if (!tokens) return [];

  try {
    const res = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        sort: {
          direction: "descending",
          timestamp: "last_edited_time",
        },
        page_size: 20,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || [])
      .filter((item: any) => item.object === "page")
      .map((page: any) => {
        const titleProp = page.properties?.title?.title?.[0]?.plain_text
          || page.properties?.Name?.title?.[0]?.plain_text
          || "Untitled";

        const now = Date.now();
        const edited = new Date(page.last_edited_time).getTime();
        const diffH = Math.round((now - edited) / 3_600_000);
        const lastEdited =
          diffH < 1 ? "just now" : diffH < 24 ? `${diffH}h ago` : `${Math.round(diffH / 24)}d ago`;

        return {
          title: titleProp,
          lastEdited,
          url: page.url || "",
          parent: page.parent?.database_id ? "database" : page.parent?.page_id ? "page" : "workspace",
        };
      });
  } catch {
    return [];
  }
}

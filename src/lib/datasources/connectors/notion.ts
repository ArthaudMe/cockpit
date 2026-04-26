import type { OAuthConfig, TokenSet, NotionPage } from "../types";
import { getTokens } from "../token-store";
import { isProxyEnabled, proxyExchangeCode } from "../oauth-proxy";

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
  let data: any;

  if (isProxyEnabled()) {
    data = await proxyExchangeCode("notion", code, redirectUri);
  } else {
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
    data = await res.json();
    if (data.error) throw new Error(data.error || "Notion OAuth failed");
  }

  return {
    access_token: data.access_token,
    token_type: data.token_type,
    // Notion tokens don't expire
  };
}

function getNotionTokens(): TokenSet | null {
  // Check for stored OAuth tokens first, then fall back to internal integration token
  const stored = getTokens("notion");
  if (stored) return stored;

  const internalToken = process.env.NOTION_INTERNAL_TOKEN;
  if (internalToken) {
    return { access_token: internalToken, token_type: "bearer" };
  }
  return null;
}

export function isNotionConnected(): boolean {
  return getNotionTokens() !== null;
}

export async function searchNotionPages(query: string): Promise<NotionPage[]> {
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
        query,
        sort: {
          direction: "descending",
          timestamp: "last_edited_time",
        },
        page_size: 15,
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

        return {
          title: titleProp,
          lastEdited: new Date(page.last_edited_time).toISOString(),
          url: page.url || "",
          parent: page.parent?.database_id ? "database" : page.parent?.page_id ? "page" : "workspace",
        };
      });
  } catch {
    return [];
  }
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

// ─── Write Actions ────────────────────────────────────────────────

export async function appendToNotionPage(params: {
  pageId: string;
  content: string;
}): Promise<{ success: boolean; message: string; url?: string }> {
  const tokens = getNotionTokens();
  if (!tokens) return { success: false, message: "Notion not connected. Please connect Notion in Settings." };

  // Split content into paragraphs and create block children
  const blocks = params.content.split("\n").filter(Boolean).map((text) => ({
    object: "block" as const,
    type: "paragraph" as const,
    paragraph: {
      rich_text: [{ type: "text" as const, text: { content: text } }],
    },
  }));

  try {
    const res = await fetch(
      `https://api.notion.com/v1/blocks/${params.pageId}/children`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({ children: blocks }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, message: `Notion API error: ${res.status} ${(err as any).message || res.statusText}` };
    }

    return {
      success: true,
      message: `Content appended to Notion page`,
      url: `https://notion.so/${params.pageId.replace(/-/g, "")}`,
    };
  } catch (err) {
    return { success: false, message: `Notion request failed: ${(err as Error).message}` };
  }
}

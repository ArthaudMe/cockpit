import crypto from "crypto";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  getMcpServer,
  getMcpServerByOAuthState,
  patchMcpServerOAuth,
  type McpServerConfig,
} from "./mcp-store";

class AuthorizationRedirect extends Error {
  constructor(readonly url: string) {
    super("MCP authorization redirect required");
  }
}

class PersistedMcpOAuthProvider implements OAuthClientProvider {
  constructor(
    private readonly serverId: string,
    private readonly redirectUri: string,
  ) {}

  get redirectUrl() {
    return this.redirectUri;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Cockpit",
      redirect_uris: [this.redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    };
  }

  async state(): Promise<string> {
    const state = crypto.randomUUID();
    patchMcpServerOAuth(this.serverId, (oauth) => ({ ...oauth, state }));
    return state;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.current().oauth?.clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    patchMcpServerOAuth(this.serverId, (oauth) => ({
      ...oauth,
      clientInformation,
    }));
  }

  tokens(): OAuthTokens | undefined {
    return this.current().oauth?.tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    patchMcpServerOAuth(this.serverId, (oauth) => ({
      ...oauth,
      tokens,
      state: undefined,
      codeVerifier: undefined,
    }));
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    throw new AuthorizationRedirect(authorizationUrl.toString());
  }

  saveCodeVerifier(codeVerifier: string): void {
    patchMcpServerOAuth(this.serverId, (oauth) => ({
      ...oauth,
      codeVerifier,
    }));
  }

  codeVerifier(): string {
    const verifier = this.current().oauth?.codeVerifier;
    if (!verifier) throw new Error("MCP OAuth verifier expired. Start the connection again.");
    return verifier;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier"): void {
    patchMcpServerOAuth(this.serverId, (oauth) => {
      const next = { ...oauth };
      if (scope === "all" || scope === "client") delete next.clientInformation;
      if (scope === "all" || scope === "tokens") delete next.tokens;
      if (scope === "all" || scope === "verifier") {
        delete next.codeVerifier;
        delete next.state;
      }
      return next;
    });
  }

  private current(): McpServerConfig {
    const server = getMcpServer(this.serverId);
    if (!server) throw new Error("MCP server was removed.");
    return server;
  }
}

export function createMcpAuthProvider(
  serverId: string,
  redirectUri = "http://localhost/api/datasources/mcp/callback",
): OAuthClientProvider {
  return new PersistedMcpOAuthProvider(serverId, redirectUri);
}

export async function startMcpAuthorization(
  server: McpServerConfig,
  redirectUri: string,
): Promise<{ authorized: true } | { authorized: false; url: string }> {
  if (!server.url) throw new Error("MCP server URL is missing.");
  const provider = new PersistedMcpOAuthProvider(server.id, redirectUri);

  try {
    const result = await auth(provider, { serverUrl: server.url });
    if (result === "AUTHORIZED") return { authorized: true };
    throw new Error("MCP authorization redirect was not captured.");
  } catch (err) {
    if (err instanceof AuthorizationRedirect) {
      return { authorized: false, url: err.url };
    }
    throw err;
  }
}

export async function completeMcpAuthorization(
  state: string,
  code: string,
  redirectUri: string,
): Promise<McpServerConfig> {
  const server = getMcpServerByOAuthState(state);
  if (!server) throw new Error("MCP OAuth state expired or invalid. Start the connection again.");
  if (!server.url) throw new Error("MCP server URL is missing.");

  const provider = new PersistedMcpOAuthProvider(server.id, redirectUri);
  await auth(provider, {
    serverUrl: server.url,
    authorizationCode: code,
  });

  const updated = getMcpServer(server.id);
  if (!updated) throw new Error("MCP server was removed.");
  return updated;
}

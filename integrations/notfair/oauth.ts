/**
 * NotFair OAuth 2.1 (authorization code + PKCE) for the runtime MCP client.
 *
 * NotFair issues no static API keys: an MCP client authorizes once (browser
 * flow) and then holds OAuth tokens that the MCP SDK refreshes automatically.
 * This module implements the SDK's OAuthClientProvider with pluggable
 * persistence:
 *   - EnvTokenStore: tokens/client registration from environment variables
 *     (NOTFAIR_OAUTH_TOKENS / NOTFAIR_OAUTH_CLIENT as JSON). Refreshed tokens
 *     are kept in memory for the process lifetime.
 *   - SupabaseTokenStore: `integration_secrets` table (service role only).
 *
 * Run `npm run notfair:auth` once on a machine with a browser to obtain the
 * initial tokens (see scripts/notfair-auth.ts).
 */

import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

export interface StoredOAuthState {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  /** CSRF nonce for an in-flight browser authorization (see app/api/integrations/notfair/authorize). */
  pendingState?: string;
  authorizationServerUrl?: string;
}

export interface TokenStore {
  load(): Promise<StoredOAuthState>;
  save(state: StoredOAuthState): Promise<void>;
}

/** In-memory store seeded from environment variables. */
export class EnvTokenStore implements TokenStore {
  private state: StoredOAuthState;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.state = {
      client: parseJson<OAuthClientInformationMixed>(env.NOTFAIR_OAUTH_CLIENT),
      tokens: parseJson<OAuthTokens>(env.NOTFAIR_OAUTH_TOKENS),
    };
  }
  async load() {
    return this.state;
  }
  async save(state: StoredOAuthState) {
    this.state = { ...this.state, ...state };
    if (state.tokens?.refresh_token && process.env.NODE_ENV !== "test") {
      console.warn("[notfair] OAuth tokens were refreshed but EnvTokenStore cannot persist them; set NOTFAIR_OAUTH_TOKENS from the latest value or use the Supabase store.");
    }
  }
  snapshot() {
    return this.state;
  }
}

/** Supabase-backed store (service role). Table: integration_secrets (migration 0003). */
export class SupabaseTokenStore implements TokenStore {
  constructor(
    private readonly db: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any -- SupabaseClient without importing types into the edge bundle
    private readonly organizationId: string,
    private readonly key = "notfair",
  ) {}
  async load(): Promise<StoredOAuthState> {
    const { data, error } = await this.db.from("integration_secrets").select("secret").eq("organization_id", this.organizationId).eq("key", this.key).maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.secret as StoredOAuthState) ?? {};
  }
  async save(state: StoredOAuthState) {
    const current = await this.load();
    const { error } = await this.db.from("integration_secrets").upsert({ organization_id: this.organizationId, key: this.key, secret: { ...current, ...state }, updated_at: new Date().toISOString() }, { onConflict: "organization_id,key" });
    if (error) throw new Error(error.message);
  }
}

/** OAuth client metadata AdPilot registers with NotFair — shared by the CLI script and the deployed authorize route. */
export function notFairClientMetadata(redirectUrl: string): OAuthClientMetadata {
  return {
    client_name: "AdPilot AI",
    redirect_uris: [redirectUrl],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

export interface NotFairOAuthOptions {
  store: TokenStore;
  /** Redirect URI registered for the one-time browser flow (CLI default: http://127.0.0.1:8765/callback). */
  redirectUrl?: string;
  /** Called when interactive authorization is required (CLI prints the URL; server throws). */
  onAuthorizationUrl?: (url: URL) => void | Promise<void>;
  clientName?: string;
}

export class NotFairOAuthProvider implements OAuthClientProvider {
  private cache: StoredOAuthState | null = null;
  constructor(private readonly opts: NotFairOAuthOptions) {}

  get redirectUrl() {
    return this.opts.redirectUrl ?? "http://127.0.0.1:8765/callback";
  }

  get clientMetadata(): OAuthClientMetadata {
    return notFairClientMetadata(String(this.redirectUrl));
  }

  private async loadState() {
    if (!this.cache) this.cache = await this.opts.store.load();
    return this.cache;
  }

  private async persist(patch: StoredOAuthState) {
    this.cache = { ...(await this.loadState()), ...patch };
    await this.opts.store.save(patch);
  }

  async clientInformation() {
    return (await this.loadState()).client;
  }
  async saveClientInformation(client: OAuthClientInformationMixed) {
    await this.persist({ client });
  }
  async tokens() {
    return (await this.loadState()).tokens;
  }
  async saveTokens(tokens: OAuthTokens) {
    await this.persist({ tokens });
  }
  async redirectToAuthorization(url: URL) {
    if (this.opts.onAuthorizationUrl) return this.opts.onAuthorizationUrl(url);
    throw new Error(`NotFair authorization required. Run \`npm run notfair:auth\` to authorize AdPilot (authorization URL: ${url.origin}${url.pathname}).`);
  }
  async saveCodeVerifier(codeVerifier: string) {
    await this.persist({ codeVerifier });
  }
  async codeVerifier() {
    const v = (await this.loadState()).codeVerifier;
    if (!v) throw new Error("No PKCE code verifier saved for NotFair authorization.");
    return v;
  }
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all") await this.persist({ client: undefined, tokens: undefined, codeVerifier: undefined });
    else if (scope === "client") await this.persist({ client: undefined });
    else if (scope === "tokens") await this.persist({ tokens: undefined });
    else if (scope === "verifier") await this.persist({ codeVerifier: undefined });
  }
}

function parseJson<T>(raw: string | undefined): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** True when either OAuth material or a static bearer token is present. */
export function notfairAuthConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.NOTFAIR_API_KEY || env.NOTFAIR_OAUTH_TOKENS || env.NOTFAIR_OAUTH_CLIENT || env.NOTFAIR_TOKEN_STORE === "supabase");
}

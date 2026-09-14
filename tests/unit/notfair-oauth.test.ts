import { describe, expect, it, vi } from "vitest";
import { EnvTokenStore, NotFairOAuthProvider, notfairAuthConfigured, type StoredOAuthState, type TokenStore } from "@/integrations/notfair/oauth";

class MemoryStore implements TokenStore {
  state: StoredOAuthState = {};
  saves = 0;
  async load() {
    return this.state;
  }
  async save(patch: StoredOAuthState) {
    this.saves += 1;
    this.state = { ...this.state, ...patch };
  }
}

describe("NotFairOAuthProvider", () => {
  it("advertises a PKCE public client with authorization_code + refresh_token grants", () => {
    const p = new NotFairOAuthProvider({ store: new MemoryStore() });
    expect(p.clientMetadata.grant_types).toEqual(["authorization_code", "refresh_token"]);
    expect(p.clientMetadata.token_endpoint_auth_method).toBe("none");
    expect(p.clientMetadata.redirect_uris).toEqual([String(p.redirectUrl)]);
  });

  it("persists client registration, tokens and the PKCE verifier through the store", async () => {
    const store = new MemoryStore();
    const p = new NotFairOAuthProvider({ store });
    await p.saveClientInformation({ client_id: "abc" });
    await p.saveCodeVerifier("verifier");
    await p.saveTokens({ access_token: "t", token_type: "bearer", refresh_token: "r" });
    expect(await p.clientInformation()).toEqual({ client_id: "abc" });
    expect(await p.codeVerifier()).toBe("verifier");
    expect((await p.tokens())?.refresh_token).toBe("r");
    expect(store.saves).toBe(3);
  });

  it("throws when a code verifier is requested before authorization started", async () => {
    const p = new NotFairOAuthProvider({ store: new MemoryStore() });
    await expect(p.codeVerifier()).rejects.toThrow(/code verifier/);
  });

  it("refuses interactive authorization on the server unless a handler is provided", async () => {
    const p = new NotFairOAuthProvider({ store: new MemoryStore() });
    await expect(p.redirectToAuthorization(new URL("https://notfair.co/oauth/authorize?x=1"))).rejects.toThrow(/notfair:auth/);
    const onUrl = vi.fn();
    const q = new NotFairOAuthProvider({ store: new MemoryStore(), onAuthorizationUrl: onUrl });
    await q.redirectToAuthorization(new URL("https://notfair.co/oauth/authorize"));
    expect(onUrl).toHaveBeenCalledOnce();
  });

  it("invalidates credentials by scope", async () => {
    const store = new MemoryStore();
    const p = new NotFairOAuthProvider({ store });
    await p.saveClientInformation({ client_id: "abc" });
    await p.saveTokens({ access_token: "t", token_type: "bearer" });
    await p.invalidateCredentials("tokens");
    expect(await p.tokens()).toBeUndefined();
    expect(await p.clientInformation()).toEqual({ client_id: "abc" });
    await p.invalidateCredentials("all");
    expect(await p.clientInformation()).toBeUndefined();
  });

  it("EnvTokenStore reads JSON material from the environment", async () => {
    const store = new EnvTokenStore({ NOTFAIR_OAUTH_TOKENS: JSON.stringify({ access_token: "x", token_type: "bearer" }), NOTFAIR_OAUTH_CLIENT: "{bad json" } as unknown as NodeJS.ProcessEnv);
    const s = await store.load();
    expect(s.tokens?.access_token).toBe("x");
    expect(s.client).toBeUndefined();
    expect(notfairAuthConfigured({ NOTFAIR_OAUTH_TOKENS: "{}" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(notfairAuthConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});

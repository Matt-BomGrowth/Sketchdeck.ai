/**
 * One-time NotFair OAuth 2.1 authorization for AdPilot's runtime client.
 *
 *   NOTFAIR_MCP_URL=https://notfair.co/api/mcp/google_ads npm run notfair:auth
 *
 * 1. Discovers NotFair's authorization server, registers AdPilot as an OAuth
 *    client (dynamic registration) and starts a PKCE authorization-code flow.
 * 2. Prints the authorization URL — open it in a browser and approve.
 * 3. Receives the code on http://127.0.0.1:8765/callback, exchanges it for
 *    tokens and prints the two JSON values to store as environment variables:
 *       NOTFAIR_OAUTH_CLIENT  (client registration)
 *       NOTFAIR_OAUTH_TOKENS  (access + refresh token)
 *    With NOTFAIR_TOKEN_STORE=supabase and service-role credentials, tokens
 *    are written to integration_secrets instead.
 * 4. Verifies the connection with a read-only capability search.
 *
 * Run this on a machine that can reach notfair.co with a browser; nothing is
 * printed except the values you must store, never commit them.
 */
import "@/lib/config/load-env";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { EnvTokenStore, NotFairOAuthProvider, SupabaseTokenStore, type TokenStore } from "@/integrations/notfair/oauth";

const PORT = Number(process.env.NOTFAIR_AUTH_PORT ?? 8765);
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;

async function main() {
  const url = process.env.NOTFAIR_MCP_URL;
  if (!url) throw new Error("Set NOTFAIR_MCP_URL (e.g. https://notfair.co/api/mcp/google_ads — confirm the exact endpoint in your NotFair workspace).");

  let store: TokenStore;
  const envStore = new EnvTokenStore();
  if (process.env.NOTFAIR_TOKEN_STORE === "supabase") {
    const { createSupabaseAdminClient } = await import("@/lib/db/supabase-admin");
    const orgId = process.env.ADPILOT_ORGANIZATION_ID;
    if (!orgId) throw new Error("ADPILOT_ORGANIZATION_ID is required with NOTFAIR_TOKEN_STORE=supabase");
    store = new SupabaseTokenStore(createSupabaseAdminClient(), orgId);
  } else {
    store = envStore;
  }

  const codePromise = new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? "/", REDIRECT);
      if (u.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = u.searchParams.get("code");
      const err = u.searchParams.get("error");
      res.writeHead(200, { "content-type": "text/html" }).end(`<p>${code ? "AdPilot is authorized with NotFair. You can close this tab." : `Authorization failed: ${err}`}</p>`);
      server.close();
      if (code) resolve(code);
      else reject(new Error(`Authorization failed: ${err ?? "no code"}`));
    });
    server.listen(PORT, "127.0.0.1");
  });

  const provider = new NotFairOAuthProvider({
    store,
    redirectUrl: REDIRECT,
    onAuthorizationUrl: (authUrl) => {
      console.log("\nOpen this URL in your browser and approve access:\n\n  " + authUrl.toString() + "\n");
    },
  });

  const transport = new StreamableHTTPClientTransport(new URL(url), { authProvider: provider });
  const client = new Client({ name: "adpilot-ai-auth", version: "0.1.0" });
  try {
    await client.connect(transport);
    console.log("Already authorized — existing tokens are valid.");
  } catch (err) {
    if (!(err instanceof UnauthorizedError)) throw err;
    const code = await codePromise;
    await transport.finishAuth(code);
    const retry = new StreamableHTTPClientTransport(new URL(url), { authProvider: provider });
    await client.connect(retry);
    console.log("Authorized.");
  }

  const result = await client.callTool({ name: "search", arguments: { query: "list connected accounts" } });
  const text = (result.content as Array<{ type: string; text?: string }>).find((c) => c.type === "text")?.text ?? "";
  try {
    const parsed = JSON.parse(text) as { connectedPlatforms?: Array<{ platform: string; primaryAccountId: string }> };
    console.log("Connected platforms:", parsed.connectedPlatforms ?? "(none reported)");
  } catch {
    console.log("Search response:", text.slice(0, 300));
  }
  await client.close();

  if (store === envStore) {
    const snap = envStore.snapshot();
    console.log("\nStore these as environment variables (do NOT commit):\n");
    console.log(`NOTFAIR_OAUTH_CLIENT='${JSON.stringify(snap.client)}'`);
    console.log(`NOTFAIR_OAUTH_TOKENS='${JSON.stringify(snap.tokens)}'`);
  } else {
    console.log("\nTokens stored in integration_secrets.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

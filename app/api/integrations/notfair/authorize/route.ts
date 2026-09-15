import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { discoverOAuthServerInfo, registerClient, startAuthorization } from "@modelcontextprotocol/sdk/client/auth.js";
import { isAuthorizedAdminRequest } from "@/lib/auth/admin-request";
import { SupabaseTokenStore, notFairClientMetadata } from "@/integrations/notfair/oauth";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Start NotFair's OAuth 2.1 (PKCE) authorization from a browser — no terminal
 * needed. Visiting this URL:
 *   1. Discovers NotFair's authorization server for NOTFAIR_MCP_URL.
 *   2. Dynamically registers AdPilot as an OAuth client (once; reused after).
 *   3. Builds a PKCE authorization URL, saves the verifier + a CSRF state
 *      nonce in `integration_secrets` (service-role only), and redirects the
 *      browser to NotFair to approve access.
 *
 * NotFair redirects back to /api/integrations/notfair/callback, which
 * completes the token exchange and stores the resulting tokens the same way.
 */
export async function GET(request: Request) {
  if (!(await isAuthorizedAdminRequest(request))) {
    return NextResponse.json({ error: "unauthorized", hint: "Open with ?key=<CRON_SECRET>, or sign in as a non-viewer user when authentication is enforced." }, { status: 401 });
  }

  const mcpUrl = process.env.NOTFAIR_MCP_URL;
  const organizationId = process.env.ADPILOT_ORGANIZATION_ID;
  if (!mcpUrl) return NextResponse.json({ error: "not_configured", hint: "Set NOTFAIR_MCP_URL in Vercel environment variables." }, { status: 503 });
  if (!organizationId) return NextResponse.json({ error: "not_configured", hint: "Set ADPILOT_ORGANIZATION_ID in Vercel environment variables." }, { status: 503 });

  let store: SupabaseTokenStore;
  try {
    store = new SupabaseTokenStore(createSupabaseAdminClient(), organizationId);
  } catch (err) {
    return NextResponse.json({ error: "not_configured", hint: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }

  const redirectUri = new URL("/api/integrations/notfair/callback", request.url).toString();

  try {
    const { authorizationServerUrl, authorizationServerMetadata } = await discoverOAuthServerInfo(mcpUrl);

    const existing = await store.load();
    let clientInformation = existing.client;
    if (!clientInformation) {
      clientInformation = await registerClient(authorizationServerUrl, { metadata: authorizationServerMetadata, clientMetadata: notFairClientMetadata(redirectUri) });
      await store.save({ client: clientInformation });
    }

    const state = randomBytes(24).toString("hex");
    const { authorizationUrl, codeVerifier } = await startAuthorization(authorizationServerUrl, {
      metadata: authorizationServerMetadata,
      clientInformation,
      redirectUrl: redirectUri,
      state,
      resource: new URL(mcpUrl),
    });
    await store.save({ codeVerifier, pendingState: state, authorizationServerUrl });

    return NextResponse.redirect(authorizationUrl.toString(), { status: 307 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "authorize_failed", message }, { status: 502 });
  }
}

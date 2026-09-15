import { NextResponse } from "next/server";
import { exchangeAuthorization, discoverAuthorizationServerMetadata } from "@modelcontextprotocol/sdk/client/auth.js";
import { SupabaseTokenStore } from "@/integrations/notfair/oauth";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * NotFair OAuth callback. The `state` value doubles as its own CSRF proof: it
 * was generated and stored by /authorize (which is itself admin-gated), so a
 * match here is sufficient — no separate auth check is needed on this route.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const settingsUrl = new URL("/integrations", url.origin);

  if (errorParam) return redirectWithStatus(settingsUrl, "error", `NotFair denied authorization: ${errorParam}`);
  if (!code || !state) return redirectWithStatus(settingsUrl, "error", "Missing code or state from NotFair's redirect.");

  const organizationId = process.env.ADPILOT_ORGANIZATION_ID;
  const mcpUrl = process.env.NOTFAIR_MCP_URL;
  if (!organizationId || !mcpUrl) return redirectWithStatus(settingsUrl, "error", "NOTFAIR_MCP_URL or ADPILOT_ORGANIZATION_ID is not configured.");

  try {
    const store = new SupabaseTokenStore(createSupabaseAdminClient(), organizationId);
    const pending = await store.load();
    if (!pending.pendingState || pending.pendingState !== state) return redirectWithStatus(settingsUrl, "error", "Authorization state did not match — the request may have expired. Try connecting again.");
    if (!pending.codeVerifier || !pending.client || !pending.authorizationServerUrl) return redirectWithStatus(settingsUrl, "error", "No pending NotFair authorization found. Start over from Integrations.");

    const metadata = await discoverAuthorizationServerMetadata(pending.authorizationServerUrl).catch(() => undefined);
    const redirectUri = new URL("/api/integrations/notfair/callback", url.origin).toString();
    const tokens = await exchangeAuthorization(pending.authorizationServerUrl, {
      metadata,
      clientInformation: pending.client,
      authorizationCode: code,
      codeVerifier: pending.codeVerifier,
      redirectUri,
      resource: new URL(mcpUrl),
    });

    await store.save({ tokens, codeVerifier: undefined, pendingState: undefined });
    return redirectWithStatus(settingsUrl, "connected", "NotFair is connected.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return redirectWithStatus(settingsUrl, "error", `Token exchange failed: ${message}`);
  }
}

function redirectWithStatus(base: URL, status: "connected" | "error", message: string) {
  const u = new URL(base);
  u.searchParams.set("notfair", status);
  u.searchParams.set("notfairMessage", message);
  return NextResponse.redirect(u.toString(), { status: 302 });
}

import { NextResponse } from "next/server";
import { isAuthorizedAdminRequest } from "@/lib/auth/admin-request";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Temporary diagnostic: confirms whether SUPABASE_SERVICE_ROLE_KEY actually
 * bypasses RLS (i.e. is a real service-role key) rather than guessing from
 * downstream error messages. Never exposes the key itself, only its shape.
 * Remove once the NotFair "row violates row-level security policy" issue is resolved.
 */
export async function GET(request: Request) {
  if (!(await isAuthorizedAdminRequest(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const keyShape = {
    present: Boolean(rawKey),
    length: rawKey.length,
    prefix: rawKey.slice(0, 12),
    looksLikeNewSecretFormat: rawKey.startsWith("sb_secret_"),
    looksLikeLegacyJwt: rawKey.startsWith("eyJ"),
  };

  const orgId = process.env.ADPILOT_ORGANIZATION_ID;
  let bypassesRls: boolean | null = null;
  let orgSelectError: string | null = null;
  let insertError: string | null = null;

  try {
    const db = createSupabaseAdminClient();

    if (orgId) {
      const { data, error } = await db.from("organizations").select("id").eq("id", orgId).maybeSingle();
      if (error) orgSelectError = error.message;
      else bypassesRls = Boolean(data);
    }

    const probeKey = `__diagnostic_probe_${Date.now()}`;
    const { error: upsertErr } = await db.from("integration_secrets").upsert({ organization_id: orgId ?? "00000000-0000-0000-0000-000000000000", key: probeKey, secret: { probe: true } }, { onConflict: "organization_id,key" });
    if (upsertErr) insertError = upsertErr.message;
    else await db.from("integration_secrets").delete().eq("key", probeKey);
  } catch (err) {
    insertError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    keyShape,
    orgId: orgId ?? null,
    bypassesRls,
    orgSelectError,
    insertError,
    verdict: insertError ? "SUPABASE_SERVICE_ROLE_KEY is NOT bypassing RLS — it is not a valid service-role key." : "SUPABASE_SERVICE_ROLE_KEY correctly bypasses RLS.",
  });
}

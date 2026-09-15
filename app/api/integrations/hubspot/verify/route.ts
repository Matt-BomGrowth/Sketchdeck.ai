import { NextResponse } from "next/server";
import { verifyHubSpot } from "@/integrations/hubspot/verify";
import { isAuthorizedAdminRequest } from "@/lib/auth/admin-request";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Server-side HubSpot verification for deployed environments (no terminal needed).
 *
 * Access: either a signed-in non-viewer user (when authentication is enforced,
 * i.e. DATA_MODE=live or DEMO_REQUIRE_AUTH=true) or the CRON_SECRET passed as
 * `Authorization: Bearer <secret>` or `?key=<secret>` for a one-off browser check.
 * The response never includes the HubSpot Service Key.
 */
export async function GET(request: Request) {
  if (!(await isAuthorizedAdminRequest(request))) {
    return NextResponse.json({ error: "unauthorized", hint: "Open this URL with ?key=<CRON_SECRET>, or sign in as a non-viewer user when authentication is enforced." }, { status: 401 });
  }
  const days = Math.min(365, Math.max(7, Number(new URL(request.url).searchParams.get("days") ?? 90) || 90));
  const report = await verifyHubSpot(undefined, days);
  return NextResponse.json(report, { status: report.error === "not_configured" ? 503 : 200, headers: { "cache-control": "no-store" } });
}


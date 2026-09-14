import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { verifyHubSpot } from "@/integrations/hubspot/verify";
import { authRequired } from "@/lib/config/data-mode";
import { canApprove, getSessionUser } from "@/lib/auth/session";

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
  if (!(await authorized(request))) {
    return NextResponse.json({ error: "unauthorized", hint: "Open this URL with ?key=<CRON_SECRET>, or sign in as a non-viewer user when authentication is enforced." }, { status: 401 });
  }
  const days = Math.min(365, Math.max(7, Number(new URL(request.url).searchParams.get("days") ?? 90) || 90));
  const report = await verifyHubSpot(undefined, days);
  return NextResponse.json(report, { status: report.error === "not_configured" ? 503 : 200, headers: { "cache-control": "no-store" } });
}

async function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const url = new URL(request.url);
    const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "";
    if (supplied && safeEqual(supplied, secret)) return true;
  }
  if (authRequired()) {
    const user = await getSessionUser();
    return Boolean(user && user.id !== "demo-user" && canApprove(user));
  }
  return false;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

import { timingSafeEqual } from "node:crypto";
import { authRequired } from "@/lib/config/data-mode";
import { canApprove, getSessionUser } from "./session";

/**
 * Shared guard for admin-only server endpoints reachable from a browser with
 * no terminal (HubSpot verification, NotFair authorization). Access is either:
 *   - CRON_SECRET passed as `Authorization: Bearer <secret>` or `?key=<secret>`
 *     (lets an operator open the URL directly before sign-in is wired up), or
 *   - a signed-in non-viewer user, when authentication is enforced.
 */
export async function isAuthorizedAdminRequest(request: Request): Promise<boolean> {
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

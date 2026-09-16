import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Protect cron endpoints with CRON_SECRET. Vercel Cron sends it as a Bearer
 * token; a `?key=` query param is also accepted so an operator can trigger a
 * scan manually from a browser address bar (no terminal required).
 */
export function authorizeCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    return null; // local development
  }
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const supplied = bearer || new URL(request.url).searchParams.get("key") || "";
  if (!supplied || !safeEqual(supplied, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

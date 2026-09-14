import { NextResponse } from "next/server";

/** Protect cron endpoints with CRON_SECRET (Vercel sends it as a Bearer token). */
export function authorizeCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
    return null; // local development
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

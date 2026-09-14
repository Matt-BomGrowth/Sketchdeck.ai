import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/auth/cron";
import { getJobRepository } from "@/lib/data";
import { runHourlyScan } from "@/jobs/hourly-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    const repo = await getJobRepository();
    const run = await runHourlyScan(repo);
    return NextResponse.json(run, { status: run.status === "failed" ? 500 : 200 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

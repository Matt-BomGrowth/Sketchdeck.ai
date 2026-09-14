import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/auth/cron";
import { getJobRepository } from "@/lib/data";
import { runDailyBrief } from "@/jobs/daily-brief";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  try {
    const repo = await getJobRepository();
    const brief = await runDailyBrief(repo);
    return NextResponse.json({ id: brief.id, date: brief.date, subject: brief.subject, delivery: brief.delivery ?? null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

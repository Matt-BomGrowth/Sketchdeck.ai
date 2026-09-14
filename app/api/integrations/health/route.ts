import { NextResponse } from "next/server";
import { getRepository } from "@/lib/data";
import { checkAllIntegrations } from "@/integrations/registry";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Live health for every integration (independent checks; one failure never hides the others). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const repo = await getRepository();
  if (repo.mode === "demo") return NextResponse.json({ mode: "demo", statuses: await repo.getIntegrationStatuses() });
  const statuses = await checkAllIntegrations();
  return NextResponse.json({ mode: "live", statuses });
}

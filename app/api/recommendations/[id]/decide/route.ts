import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { canApprove, getSessionUser } from "@/lib/auth/session";
import { executeApprovedAction } from "@/agent/actions/execute";

export const dynamic = "force-dynamic";

const Body = z.object({
  decision: z.enum(["approve", "modify", "reject"]),
  modifiedBudgetTo: z.number().positive().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canApprove(user)) return NextResponse.json({ error: "forbidden: viewers cannot approve" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await ctx.params;
  try {
    const repo = await getRepository();
    const result = await repo.decideRecommendation(id, { ...parsed.data, approver: user.name });
    let executed = null;
    if (result.action) executed = await executeApprovedAction(repo, result.action, result.recommendation);
    return NextResponse.json({ recommendation: executed?.recommendation ?? result.recommendation, action: executed?.action ?? result.action ?? null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

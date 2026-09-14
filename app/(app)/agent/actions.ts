"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRepository } from "@/lib/data";
import { canApprove, getSessionUser } from "@/lib/auth/session";
import { executeApprovedAction } from "@/agent/actions/execute";
import { loadSnapshot } from "@/lib/analytics/load-snapshot";
import { runHourlyScan } from "@/jobs/hourly-scan";
import { runDailyBrief } from "@/jobs/daily-brief";

const DecideInput = z.object({
  id: z.string().min(1),
  decision: z.enum(["approve", "modify", "reject"]),
  modifiedBudgetTo: z.number().positive().optional(),
  note: z.string().max(500).optional(),
});

export interface DecideResult {
  ok: boolean;
  message: string;
}

/** Approve / modify / reject a recommendation; executes approved changes through the configured adapter. */
export async function decideRecommendation(input: z.infer<typeof DecideInput>): Promise<DecideResult> {
  const parsed = DecideInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input" };
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in required" };
  if (!canApprove(user)) return { ok: false, message: "Viewers cannot approve actions" };
  try {
    const repo = await getRepository();
    // Make sure the latest generated recommendations are stored before deciding (demo: in-memory).
    const existing = await repo.getRecommendations();
    if (!existing.some((r) => r.id === parsed.data.id)) {
      const snapshot = await loadSnapshot(repo, 30);
      await repo.saveRecommendations(snapshot.recommendations);
    }
    const result = await repo.decideRecommendation(parsed.data.id, { ...parsed.data, approver: user.name });
    let message = `Recommendation ${parsed.data.decision === "reject" ? "rejected" : parsed.data.decision === "modify" ? "modified and approved" : "approved"}.`;
    if (result.action) {
      const exec = await executeApprovedAction(repo, result.action, result.recommendation);
      if ("pending" in exec && exec.pending) message += " Awaiting a connected executor for this platform.";
      else message += exec.action.status === "executed" ? ` Executed: ${exec.action.after}.` : ` Execution failed: ${exec.action.actualImpact ?? "unknown error"}.`;
    }
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function triggerScanNow(): Promise<DecideResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in required" };
  try {
    const repo = await getRepository();
    const run = await runHourlyScan(repo);
    revalidatePath("/", "layout");
    return { ok: run.status !== "failed", message: `Scan ${run.status}: ${run.campaignsScanned} campaigns, ${run.issuesDetected} issues, ${run.recommendationsCreated} recommendations${run.errors.length ? ` · ${run.errors.length} error(s)` : ""}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function generateBriefNow(): Promise<DecideResult & { markdown?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in required" };
  try {
    const repo = await getRepository();
    const brief = await runDailyBrief(repo);
    revalidatePath("/automation");
    return { ok: true, message: brief.delivery ? (brief.delivery.delivered ? "Brief generated and emailed." : `Brief generated; email not delivered (${brief.delivery.detail}).`) : "Brief generated (no recipients configured).", markdown: brief.summaryMarkdown };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

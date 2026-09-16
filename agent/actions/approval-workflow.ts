/**
 * OBSERVE → RECOMMEND → APPROVE → EXECUTE → MEASURE
 *
 * Pure state machine for recommendations and their resulting actions. Storage
 * and platform execution are injected so this logic is testable and works in
 * both demo and live modes.
 */

import type { OptimizationAction, Recommendation, RecommendationStatus } from "@/types/domain";
import { newId } from "@/lib/utils/id";

export type Decision = "approve" | "modify" | "reject";

export interface DecisionInput {
  decision: Decision;
  approver: string;
  /** For "modify": override the budget target. */
  modifiedBudgetTo?: number;
  note?: string;
}

export interface ExecutionAdapter {
  /** Perform the change on the platform. Must throw on failure. Returns a human-readable "after" state. */
  execute(action: OptimizationAction, rec: Recommendation): Promise<{ after: string; externalChangeId?: string }>;
}

const TRANSITIONS: Record<RecommendationStatus, RecommendationStatus[]> = {
  pending: ["approved", "modified", "rejected"],
  approved: ["executed"],
  modified: ["executed"],
  rejected: [],
  executed: ["measured"],
  measured: [],
};

export function canTransition(from: RecommendationStatus, to: RecommendationStatus) {
  return TRANSITIONS[from].includes(to);
}

export function applyDecision(rec: Recommendation, input: DecisionInput, now = new Date()): { recommendation: Recommendation; action?: OptimizationAction } {
  if (rec.status !== "pending") throw new Error(`Recommendation ${rec.id} is ${rec.status}; only pending recommendations can be decided.`);

  if (input.decision === "reject") {
    return { recommendation: { ...rec, status: "rejected" } };
  }

  let budgetChange = rec.budgetChange;
  if (input.decision === "modify") {
    if (!budgetChange || typeof input.modifiedBudgetTo !== "number" || input.modifiedBudgetTo <= 0) {
      throw new Error("Modify requires a positive modifiedBudgetTo on a budget recommendation.");
    }
    budgetChange = { ...budgetChange, to: Math.round(input.modifiedBudgetTo * 100) / 100 };
  }

  const status: RecommendationStatus = input.decision === "modify" ? "modified" : "approved";
  const updated: Recommendation = { ...rec, status, budgetChange };
  const action: OptimizationAction = {
    id: newId(),
    organizationId: rec.organizationId,
    recommendationId: rec.id,
    platform: rec.platform ?? "google",
    campaignId: rec.campaignId ?? "",
    campaignName: rec.title,
    actionType: rec.type,
    before: budgetChange ? `$${budgetChange.from}/day` : "—",
    after: budgetChange ? `$${budgetChange.to}/day` : rec.recommendedAction,
    reason: rec.why,
    expectedImpact: describeImpact(rec),
    approver: input.approver,
    status: "approved",
    createdAt: now.toISOString(),
  };
  return { recommendation: updated, action };
}

export async function executeAction(
  action: OptimizationAction,
  rec: Recommendation,
  adapter: ExecutionAdapter,
  now = new Date(),
): Promise<{ action: OptimizationAction; recommendation: Recommendation }> {
  if (action.status !== "approved") throw new Error(`Action ${action.id} is ${action.status}; only approved actions can execute.`);
  const executing: OptimizationAction = { ...action, status: "executing" };
  try {
    const result = await adapter.execute(executing, rec);
    return {
      action: { ...executing, status: "executed", after: result.after, executedAt: now.toISOString() },
      recommendation: { ...rec, status: "executed" },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      action: { ...executing, status: "failed", actualImpact: `Execution failed: ${message}` },
      recommendation: rec,
    };
  }
}

export function measureAction(action: OptimizationAction, rec: Recommendation, actualImpact: string, now = new Date()) {
  if (action.status !== "executed") throw new Error("Only executed actions can be measured.");
  return {
    action: { ...action, status: "measured" as const, actualImpact, measuredAt: now.toISOString() },
    recommendation: { ...rec, status: "measured" as const },
  };
}

export function describeImpact(rec: Recommendation): string {
  const { pipelineLow, pipelineHigh, wasteAvoided } = rec.expectedImpact;
  const parts: string[] = [];
  if (pipelineHigh > 0) parts.push(`Est. pipeline +$${Math.round(pipelineLow / 1000)}K–$${Math.round(pipelineHigh / 1000)}K/month`);
  if (wasteAvoided) parts.push(`Est. waste avoided $${Math.round(wasteAvoided).toLocaleString()}/month`);
  return parts.join("; ") || "Estimated impact not quantified";
}

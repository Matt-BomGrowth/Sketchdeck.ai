import type { AutomationPolicy, Recommendation } from "@/types/domain";

export const DEFAULT_AUTOMATION_POLICY: AutomationPolicy = {
  maxBudgetChangePct: 0.1,
  maxDailyExposure: 2000,
  approvalRequiredAbove: 5000,
  autoExecuteEnabled: false,
};

export interface PolicyDecision {
  allowedWithoutApproval: boolean;
  reasons: string[];
}

/**
 * Determine whether a recommendation may execute without human approval.
 * Default posture: everything that changes a live advertising account
 * requires approval. Auto-execution only when the organization has enabled it
 * AND the change is within every configured limit.
 */
export function evaluatePolicy(rec: Recommendation, policy: AutomationPolicy): PolicyDecision {
  const reasons: string[] = [];
  if (!policy.autoExecuteEnabled) reasons.push("Auto-execution is disabled; approval required for all live changes.");
  if (rec.type === "pause_campaign") reasons.push("Pausing a campaign always requires approval.");
  if (rec.budgetChange) {
    const { from, to } = rec.budgetChange;
    const pct = from > 0 ? Math.abs(to - from) / from : 1;
    if (pct > policy.maxBudgetChangePct) reasons.push(`Budget change ${(pct * 100).toFixed(0)}% exceeds the ${(policy.maxBudgetChangePct * 100).toFixed(0)}% limit.`);
    const exposure = Math.abs(to - from);
    if (exposure > policy.maxDailyExposure) reasons.push(`Daily exposure $${exposure.toFixed(0)} exceeds $${policy.maxDailyExposure}.`);
    if (exposure * 30 > policy.approvalRequiredAbove) reasons.push(`Monthly impact $${(exposure * 30).toFixed(0)} exceeds the $${policy.approvalRequiredAbove} approval threshold.`);
  }
  return { allowedWithoutApproval: reasons.length === 0, reasons };
}

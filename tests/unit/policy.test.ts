import { describe, it, expect } from "vitest";
import { evaluatePolicy, DEFAULT_AUTOMATION_POLICY } from "@/agent/actions/policy";
import type { AutomationPolicy, Recommendation } from "@/types/domain";

function rec(over: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "rec_1",
    organizationId: "org_test",
    campaignId: "cmp_1",
    platform: "google",
    type: "budget_increase",
    priority: "high",
    title: "t",
    whatHappened: "",
    why: "",
    recommendedAction: "",
    expectedImpact: { pipelineLow: 0, pipelineHigh: 0 },
    confidence: 0.5,
    status: "pending",
    budgetChange: { from: 100, to: 105, unit: "per_day" },
    requiresApproval: true,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

const enabled: AutomationPolicy = { ...DEFAULT_AUTOMATION_POLICY, autoExecuteEnabled: true };

describe("evaluatePolicy", () => {
  it("requires approval for everything under the default policy", () => {
    const d = evaluatePolicy(rec(), DEFAULT_AUTOMATION_POLICY);
    expect(DEFAULT_AUTOMATION_POLICY.autoExecuteEnabled).toBe(false);
    expect(d.allowedWithoutApproval).toBe(false);
    expect(d.reasons).toContain("Auto-execution is disabled; approval required for all live changes.");
  });

  it("allows a small in-limit change when auto-execute is enabled", () => {
    const d = evaluatePolicy(rec({ budgetChange: { from: 100, to: 105, unit: "per_day" } }), enabled);
    expect(d.allowedWithoutApproval).toBe(true);
    expect(d.reasons).toEqual([]);
  });

  it("always requires approval for pause_campaign", () => {
    const d = evaluatePolicy(rec({ type: "pause_campaign", budgetChange: undefined }), enabled);
    expect(d.allowedWithoutApproval).toBe(false);
    expect(d.reasons).toEqual(["Pausing a campaign always requires approval."]);
  });

  it("rejects changes exceeding maxBudgetChangePct", () => {
    const d = evaluatePolicy(rec({ budgetChange: { from: 100, to: 120, unit: "per_day" } }), enabled);
    expect(d.allowedWithoutApproval).toBe(false);
    expect(d.reasons.some((r) => /Budget change 20% exceeds the 10% limit/.test(r))).toBe(true);
  });

  it("treats a change from a zero budget as a 100% change", () => {
    const d = evaluatePolicy(rec({ budgetChange: { from: 0, to: 5, unit: "per_day" } }), enabled);
    expect(d.allowedWithoutApproval).toBe(false);
    expect(d.reasons.some((r) => /exceeds the 10% limit/.test(r))).toBe(true);
  });

  it("rejects when daily exposure or monthly impact exceeds limits", () => {
    const loose: AutomationPolicy = { maxBudgetChangePct: 1, maxDailyExposure: 100, approvalRequiredAbove: 5000, autoExecuteEnabled: true };
    const daily = evaluatePolicy(rec({ budgetChange: { from: 1000, to: 1150, unit: "per_day" } }), loose);
    expect(daily.allowedWithoutApproval).toBe(false);
    expect(daily.reasons.some((r) => /Daily exposure \$150 exceeds \$100/.test(r))).toBe(true);

    const monthly = evaluatePolicy(rec({ budgetChange: { from: 5000, to: 5200, unit: "per_day" } }), { ...loose, maxDailyExposure: 10_000 });
    expect(monthly.allowedWithoutApproval).toBe(false);
    expect(monthly.reasons.some((r) => /Monthly impact \$6000 exceeds the \$5000 approval threshold/.test(r))).toBe(true);
  });

  it("allows non-budget recommendations when enabled", () => {
    const d = evaluatePolicy(rec({ type: "audience_shift", budgetChange: undefined }), enabled);
    expect(d.allowedWithoutApproval).toBe(true);
  });
});

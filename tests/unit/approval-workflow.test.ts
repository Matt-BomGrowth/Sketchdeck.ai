import { describe, it, expect, vi } from "vitest";
import { applyDecision, executeAction, measureAction, canTransition, describeImpact, type ExecutionAdapter } from "@/agent/actions/approval-workflow";
import type { OptimizationAction, Recommendation } from "@/types/domain";

const NOW = new Date("2026-09-14T10:00:00.000Z");

function rec(over: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "rec_1",
    organizationId: "org_test",
    campaignId: "cmp_1",
    platform: "linkedin",
    type: "budget_increase",
    priority: "high",
    title: "Increase budget: Test",
    whatHappened: "what",
    why: "because",
    recommendedAction: "Raise it",
    expectedImpact: { pipelineLow: 10_000, pipelineHigh: 25_000, wasteAvoided: 1234 },
    confidence: 0.7,
    status: "pending",
    budgetChange: { from: 100, to: 120, unit: "per_day" },
    requiresApproval: true,
    createdAt: NOW.toISOString(),
    ...over,
  };
}

describe("canTransition", () => {
  it("encodes the OBSERVE → RECOMMEND → APPROVE → EXECUTE → MEASURE state machine", () => {
    expect(canTransition("pending", "approved")).toBe(true);
    expect(canTransition("pending", "modified")).toBe(true);
    expect(canTransition("pending", "rejected")).toBe(true);
    expect(canTransition("approved", "executed")).toBe(true);
    expect(canTransition("modified", "executed")).toBe(true);
    expect(canTransition("executed", "measured")).toBe(true);
    expect(canTransition("pending", "executed")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(canTransition("measured", "executed")).toBe(false);
  });
});

describe("applyDecision", () => {
  it("approve → status approved and creates an approved action", () => {
    const { recommendation, action } = applyDecision(rec(), { decision: "approve", approver: "matt" }, NOW);
    expect(recommendation.status).toBe("approved");
    expect(recommendation.budgetChange).toEqual({ from: 100, to: 120, unit: "per_day" });
    expect(action).toBeDefined();
    expect(action!.status).toBe("approved");
    expect(action!.recommendationId).toBe("rec_1");
    expect(action!.campaignId).toBe("cmp_1");
    expect(action!.platform).toBe("linkedin");
    expect(action!.actionType).toBe("budget_increase");
    expect(action!.before).toBe("$100/day");
    expect(action!.after).toBe("$120/day");
    expect(action!.approver).toBe("matt");
    expect(action!.createdAt).toBe(NOW.toISOString());
    expect(action!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("modify → status modified with the overridden budget target", () => {
    const { recommendation, action } = applyDecision(rec(), { decision: "modify", approver: "matt", modifiedBudgetTo: 110.456 }, NOW);
    expect(recommendation.status).toBe("modified");
    expect(recommendation.budgetChange).toEqual({ from: 100, to: 110.46, unit: "per_day" });
    expect(action!.after).toBe("$110.46/day");
  });

  it("modify requires a positive modifiedBudgetTo on a budget recommendation", () => {
    expect(() => applyDecision(rec(), { decision: "modify", approver: "matt" }, NOW)).toThrow(/Modify requires a positive modifiedBudgetTo/);
    expect(() => applyDecision(rec(), { decision: "modify", approver: "matt", modifiedBudgetTo: 0 }, NOW)).toThrow();
    expect(() => applyDecision(rec({ budgetChange: undefined }), { decision: "modify", approver: "matt", modifiedBudgetTo: 50 }, NOW)).toThrow();
  });

  it("reject → status rejected and no action", () => {
    const { recommendation, action } = applyDecision(rec(), { decision: "reject", approver: "matt" }, NOW);
    expect(recommendation.status).toBe("rejected");
    expect(action).toBeUndefined();
  });

  it("throws when deciding a non-pending recommendation", () => {
    for (const status of ["approved", "modified", "rejected", "executed", "measured"] as const) {
      expect(() => applyDecision(rec({ status }), { decision: "approve", approver: "matt" }, NOW)).toThrow(new RegExp(`is ${status}; only pending`));
    }
  });

  it("uses the recommended action text as 'after' for non-budget recommendations", () => {
    const { action } = applyDecision(rec({ type: "audience_shift", budgetChange: undefined }), { decision: "approve", approver: "matt" }, NOW);
    expect(action!.before).toBe("—");
    expect(action!.after).toBe("Raise it");
  });

  it("does not mutate the input recommendation", () => {
    const input = rec();
    applyDecision(input, { decision: "approve", approver: "matt" }, NOW);
    expect(input.status).toBe("pending");
  });
});

describe("executeAction", () => {
  const approved = () => applyDecision(rec(), { decision: "approve", approver: "matt" }, NOW);

  it("executes through the adapter and marks action + recommendation executed", async () => {
    const { recommendation, action } = approved();
    const adapter: ExecutionAdapter = { execute: vi.fn(async () => ({ after: "$120/day (LinkedIn change #42)", externalChangeId: "42" })) };
    const out = await executeAction(action!, recommendation, adapter, NOW);
    expect(adapter.execute).toHaveBeenCalledTimes(1);
    expect((adapter.execute as ReturnType<typeof vi.fn>).mock.calls[0][0].status).toBe("executing");
    expect(out.action.status).toBe("executed");
    expect(out.action.after).toBe("$120/day (LinkedIn change #42)");
    expect(out.action.executedAt).toBe(NOW.toISOString());
    expect(out.recommendation.status).toBe("executed");
  });

  it("marks the action failed and leaves the recommendation unchanged when the adapter throws", async () => {
    const { recommendation, action } = approved();
    const adapter: ExecutionAdapter = { execute: async () => { throw new Error("platform down"); } };
    const out = await executeAction(action!, recommendation, adapter, NOW);
    expect(out.action.status).toBe("failed");
    expect(out.action.actualImpact).toBe("Execution failed: platform down");
    expect(out.action.executedAt).toBeUndefined();
    expect(out.recommendation.status).toBe("approved");
  });

  it("refuses to execute an action that is not approved", async () => {
    const { recommendation, action } = approved();
    const adapter: ExecutionAdapter = { execute: vi.fn(async () => ({ after: "x" })) };
    await expect(executeAction({ ...action!, status: "executed" }, recommendation, adapter, NOW)).rejects.toThrow(/only approved actions can execute/);
    expect(adapter.execute).not.toHaveBeenCalled();
  });
});

describe("measureAction", () => {
  it("measures only executed actions", async () => {
    const { recommendation, action } = applyDecision(rec(), { decision: "approve", approver: "matt" }, NOW);
    const executed = await executeAction(action!, recommendation, { execute: async () => ({ after: "$120/day" }) }, NOW);
    const later = new Date("2026-09-28T10:00:00.000Z");
    const measured = measureAction(executed.action, executed.recommendation, "+$30K pipeline", later);
    expect(measured.action.status).toBe("measured");
    expect(measured.action.actualImpact).toBe("+$30K pipeline");
    expect(measured.action.measuredAt).toBe(later.toISOString());
    expect(measured.recommendation.status).toBe("measured");

    expect(() => measureAction(action!, recommendation, "x")).toThrow(/Only executed actions can be measured/);
    const failed: OptimizationAction = { ...action!, status: "failed" };
    expect(() => measureAction(failed, recommendation, "x")).toThrow();
  });
});

describe("describeImpact", () => {
  it("formats pipeline range and waste avoided", () => {
    expect(describeImpact(rec())).toBe("Est. pipeline +$10K–$25K/month; Est. waste avoided $1,234/month");
    expect(describeImpact(rec({ expectedImpact: { pipelineLow: 0, pipelineHigh: 0 } }))).toBe("Estimated impact not quantified");
  });
});

import { describe, it, expect } from "vitest";
import { simulateReallocation, absorptionCapacity } from "@/agent/optimizers/simulator";
import type { RankedCampaign } from "@/agent/optimizers/budget-optimizer";
import { makeCampaign, makeTotals } from "../helpers/series";

const high: RankedCampaign = {
  campaign: makeCampaign({ id: "cmp_high", name: "High", dailyBudget: 200 }),
  totals: makeTotals({ spend: 6000, leads: 120, mqls: 60, sqls: 30, opportunities: 10, pipeline: 300_000, revenue: 60_000 }),
  qualityScore: 85,
  rank: 1,
};

const low: RankedCampaign = {
  campaign: makeCampaign({ id: "cmp_low", name: "Low", dailyBudget: 100 }),
  totals: makeTotals({ spend: 3000, leads: 200, mqls: 30, sqls: 2, opportunities: 0, pipeline: 5_000, revenue: 0 }),
  qualityScore: 20,
  rank: 2,
};

describe("simulateReallocation", () => {
  it("projects positive net pipeline when moving from low to high quality", () => {
    const r = simulateReallocation({ amount: 600, windowDays: 30, sources: [low], targets: [high] });
    expect(r.estimated).toBe(true);
    expect(r.net.pipeline).toBeGreaterThan(0);
    expect(r.net.sqls).toBeGreaterThan(0);
    expect(r.removed.pipeline).toBeGreaterThan(0);
    expect(r.added.pipeline).toBeGreaterThan(r.removed.pipeline);
    // Low quality source generates more raw leads per dollar, so leads may drop.
    expect(r.removed.leads).toBeGreaterThan(0);
    expect(r.amount).toBe(600);
    expect(r.windowDays).toBe(30);
  });

  it("keeps confidence within [0.1, 0.9] with a matching label", () => {
    const r = simulateReallocation({ amount: 600, windowDays: 30, sources: [low], targets: [high] });
    expect(r.confidence).toBeGreaterThanOrEqual(0.1);
    expect(r.confidence).toBeLessThanOrEqual(0.9);
    expect(["Low", "Medium", "High"]).toContain(r.confidenceLabel);

    const huge = simulateReallocation({ amount: 2_000, windowDays: 30, sources: [low], targets: [{ ...high, totals: { ...high.totals, spend: 100, sqls: 0 } }] });
    expect(huge.confidence).toBeGreaterThanOrEqual(0.1);
    expect(huge.confidence).toBeLessThanOrEqual(0.9);
  });

  it("caps the moved amount at the sources' available spend", () => {
    const r = simulateReallocation({ amount: 10_000, windowDays: 30, sources: [low], targets: [high] });
    expect(r.amount).toBe(low.totals.spend);
    expect(r.notes.some((n) => /capped at available spend/.test(n))).toBe(true);
  });

  it("applies diminishing returns to the receiving campaign", () => {
    const r = simulateReallocation({ amount: 600, windowDays: 30, sources: [low], targets: [high], elasticity: 0.8 });
    const linearPipeline = (high.totals.pipeline / high.totals.spend) * 600;
    expect(r.added.pipeline).toBeLessThan(linearPipeline);
    expect(r.added.pipeline).toBeGreaterThan(0);
    const noDim = simulateReallocation({ amount: 600, windowDays: 30, sources: [low], targets: [high], elasticity: 1 });
    expect(noDim.added.pipeline).toBeCloseTo(linearPipeline, 6);
  });

  it("handles zero inputs gracefully", () => {
    const zeroAmount = simulateReallocation({ amount: 0, windowDays: 30, sources: [low], targets: [high] });
    expect(zeroAmount.estimated).toBe(true);
    expect(zeroAmount.net).toEqual({ leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 });
    expect(zeroAmount.confidence).toBe(0);
    expect(zeroAmount.confidenceLabel).toBe("Low");
    expect(zeroAmount.notes).toEqual(["Nothing to simulate."]);

    const noTargets = simulateReallocation({ amount: 500, windowDays: 30, sources: [low], targets: [] });
    expect(noTargets.net.pipeline).toBe(0);
    const noSources = simulateReallocation({ amount: 500, windowDays: 30, sources: [], targets: [high] });
    expect(noSources.net.pipeline).toBe(0);

    // A source with zero spend contributes nothing but must not produce NaN.
    const zeroSpendSource: RankedCampaign = { ...low, totals: { ...low.totals, spend: 0 } };
    const r = simulateReallocation({ amount: 500, windowDays: 30, sources: [zeroSpendSource], targets: [high] });
    for (const v of Object.values(r.net)) expect(Number.isFinite(v)).toBe(true);
    expect(r.amount).toBe(0);
  });

  it("warns about large moves relative to target spend", () => {
    const smallTarget: RankedCampaign = { ...high, totals: { ...high.totals, spend: 500 } };
    const r = simulateReallocation({ amount: 1000, windowDays: 30, sources: [low], targets: [smallTarget] });
    expect(r.notes.some((n) => /diminishing returns likely/.test(n))).toBe(true);
  });
});

describe("absorptionCapacity", () => {
  it("scales with daily budget and funnel conversion", () => {
    expect(absorptionCapacity(high.campaign, high.totals)).toBeGreaterThan(absorptionCapacity(low.campaign, low.totals));
    expect(absorptionCapacity(high.campaign, { ...high.totals, mqls: 0, sqls: 0 })).toBe(0);
  });
});

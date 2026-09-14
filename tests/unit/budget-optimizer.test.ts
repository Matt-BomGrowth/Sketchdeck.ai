import { describe, it, expect } from "vitest";
import { rankCampaigns, topN, bottomPct, buildBudgetPlan, qualityScore } from "@/agent/optimizers/budget-optimizer";
import { sumTotals } from "@/lib/calculations/metrics";
import { makeCampaign, makeTotals } from "../helpers/series";
import type { Campaign, MetricTotals } from "@/types/domain";

/** Ten campaigns with monotonically decreasing pipeline quality; two paused. */
function fixture(): Array<{ campaign: Campaign; totals: MetricTotals }> {
  const items: Array<{ campaign: Campaign; totals: MetricTotals }> = [];
  for (let i = 0; i < 10; i++) {
    const quality = 10 - i; // 10 (best) → 1 (worst)
    items.push({
      campaign: makeCampaign({
        id: `cmp_${i}`,
        name: `Campaign ${i}`,
        dailyBudget: 100 + i * 10,
        status: i === 3 || i === 7 ? "paused" : "active",
        platform: i % 3 === 0 ? "google" : i % 3 === 1 ? "meta" : "linkedin",
      }),
      totals: makeTotals({
        spend: 3000,
        leads: 100,
        mqls: 40,
        sqls: 2 + quality * 2,
        opportunities: Math.round(quality),
        pipeline: quality * 20_000,
        revenue: quality * 4_000,
      }),
    });
  }
  return items;
}

const items = fixture();
const benchmark = sumTotals(items.map((i) => i.totals));

describe("qualityScore", () => {
  it("scores the benchmark itself at roughly the centre and penalises low signal", () => {
    const s = qualityScore(benchmark, benchmark);
    expect(s).toBeCloseTo(50, 5);
    // Same unit economics at 1/1000th the volume: <2 SQLs and <$500 spend → low-signal penalties.
    const scaled = Object.fromEntries(Object.entries(benchmark).map(([k, v]) => [k, (v as number) / 1000])) as unknown as MetricTotals;
    const thin = qualityScore(scaled, benchmark);
    expect(thin).toBeCloseTo(s - 18, 5);
  });

  it("is bounded 0..100", () => {
    expect(qualityScore(makeTotals({ pipeline: 1e9, revenue: 1e9, sqls: 1000 }), benchmark)).toBeLessThanOrEqual(100);
    expect(qualityScore(makeTotals({ pipeline: 0, revenue: 0, sqls: 0, mqls: 0, opportunities: 0 }), benchmark)).toBeGreaterThanOrEqual(0);
  });
});

describe("rankCampaigns", () => {
  it("orders campaigns by descending qualityScore with 1-based ranks", () => {
    const ranked = rankCampaigns(items, benchmark);
    expect(ranked).toHaveLength(items.length);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].qualityScore).toBeGreaterThanOrEqual(ranked[i].qualityScore);
      expect(ranked[i].rank).toBe(i + 1);
    }
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].campaign.id).toBe("cmp_0");
    expect(ranked[ranked.length - 1].campaign.id).toBe("cmp_9");
  });

  it("does not depend on input order", () => {
    const shuffled = [...items].reverse();
    const a = rankCampaigns(items, benchmark).map((r) => r.campaign.id);
    const b = rankCampaigns(shuffled, benchmark).map((r) => r.campaign.id);
    expect(a).toEqual(b);
  });
});

describe("topN / bottomPct", () => {
  const ranked = rankCampaigns(items, benchmark);

  it("topN excludes paused campaigns and returns n entries", () => {
    const top = topN(ranked, 3);
    expect(top).toHaveLength(3);
    expect(top.every((r) => r.campaign.status === "active")).toBe(true);
    expect(top.map((r) => r.campaign.id)).toEqual(["cmp_0", "cmp_1", "cmp_2"]);
    // cmp_3 is paused, so cmp_4 should be next if n = 4.
    expect(topN(ranked, 4).map((r) => r.campaign.id)).toEqual(["cmp_0", "cmp_1", "cmp_2", "cmp_4"]);
  });

  it("topN honours an exclusion set (critically fatigued campaigns are never scaled up)", () => {
    const top = topN(ranked, 3, new Set(["cmp_0"]));
    expect(top.map((r) => r.campaign.id)).toEqual(["cmp_1", "cmp_2", "cmp_4"]);
  });

  it("bottomPct size is floor(active * pct) with a minimum of 1 and excludes paused", () => {
    const active = ranked.filter((r) => r.campaign.status === "active"); // 8
    const bottom = bottomPct(ranked, 0.3);
    expect(bottom).toHaveLength(Math.floor(active.length * 0.3)); // 2
    expect(bottom.every((r) => r.campaign.status === "active")).toBe(true);
    expect(bottom.map((r) => r.campaign.id)).toEqual(["cmp_8", "cmp_9"]);

    const tiny = rankCampaigns(items.slice(0, 2), benchmark);
    expect(bottomPct(tiny, 0.3)).toHaveLength(1);
  });
});

describe("buildBudgetPlan", () => {
  const plan = buildBudgetPlan(items, benchmark, { horizonDays: 30 });

  it("always requires approval", () => {
    expect(plan.requiresApproval).toBe(true);
  });

  it("moves 20% of the bottom budget by default", () => {
    expect(plan.reallocationPct).toBe(0.2);
    const bottomBudget = plan.bottom.reduce((s, b) => s + b.campaign.dailyBudget, 0);
    expect(plan.eligibleBottomBudgetDaily).toBeCloseTo(bottomBudget, 2);
    expect(plan.totalMoveDaily).toBeCloseTo(bottomBudget * 0.2, 2);
    expect(plan.totalMovePeriod).toBeCloseTo(plan.totalMoveDaily * 30, 2);
    expect(plan.horizonDays).toBe(30);
  });

  it("sums increases to totalMoveDaily and makes every decrease negative", () => {
    const incSum = plan.increases.reduce((s, m) => s + m.deltaDaily, 0);
    expect(Math.abs(incSum - plan.totalMoveDaily)).toBeLessThanOrEqual(0.05);
    const decSum = plan.decreases.reduce((s, m) => s + m.deltaDaily, 0);
    expect(Math.abs(-decSum - plan.totalMoveDaily)).toBeLessThanOrEqual(0.05);
    for (const d of plan.decreases) {
      expect(d.deltaDaily).toBeLessThan(0);
      expect(d.proposedDaily).toBeCloseTo(d.currentDaily + d.deltaDaily, 2);
      expect(d.deltaPeriod).toBeCloseTo(d.deltaDaily * 30, 2);
    }
    for (const i of plan.increases) {
      expect(i.deltaDaily).toBeGreaterThan(0);
      expect(i.proposedDaily).toBeCloseTo(i.currentDaily + i.deltaDaily, 2);
    }
  });

  it("never overlaps top and bottom", () => {
    const topIds = new Set(plan.top.map((t) => t.campaign.id));
    for (const b of plan.bottom) expect(topIds.has(b.campaign.id)).toBe(false);
    expect(plan.top).toHaveLength(3);
    expect(plan.bottom).toHaveLength(2);
    expect(plan.increases.map((m) => m.campaignId)).toEqual(plan.top.map((t) => t.campaign.id));
    expect(plan.decreases.map((m) => m.campaignId)).toEqual(plan.bottom.map((b) => b.campaign.id));
  });

  it("produces a rationale that explains the ranking basis (not CTR)", () => {
    expect(plan.rationale.length).toBeGreaterThanOrEqual(3);
    expect(plan.rationale[0]).toMatch(/not CTR/);
  });

  it("keeps excluded campaigns out of the top but still eligible for the bottom", () => {
    const excluded = buildBudgetPlan(items, benchmark, { excludeFromTop: new Set(["cmp_0", "cmp_9"]) });
    expect(excluded.top.map((t) => t.campaign.id)).toEqual(["cmp_1", "cmp_2", "cmp_4"]);
    expect(excluded.increases.map((m) => m.campaignId)).toEqual(["cmp_1", "cmp_2", "cmp_4"]);
    expect(excluded.bottom.map((b) => b.campaign.id)).toContain("cmp_9");
  });

  it("removes overlap when the active set is tiny", () => {
    const small = buildBudgetPlan(items.slice(0, 2), benchmark);
    const topIds = new Set(small.top.map((t) => t.campaign.id));
    expect(small.bottom.every((b) => !topIds.has(b.campaign.id))).toBe(true);
  });
});

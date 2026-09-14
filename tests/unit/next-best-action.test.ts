import { describe, it, expect } from "vitest";
import { generateRecommendations, resetRecommendationIds, type CampaignAssessment } from "@/agent/recommendations/next-best-action";
import { buildBudgetPlan } from "@/agent/optimizers/budget-optimizer";
import { DEFAULT_AUTOMATION_POLICY } from "@/agent/actions/policy";
import { sumTotals } from "@/lib/calculations/metrics";
import { makeCampaign, makeTotals } from "../helpers/series";
import type { MetricTotals, FatigueStatus } from "@/types/domain";
import type { Anomaly } from "@/agent/detectors/anomaly";

const healthy = { score: 80, status: "healthy" as const, label: "Healthy", components: [] };

function assessment(
  id: string,
  totals: MetricTotals,
  opts: { fatigue?: FatigueStatus; status?: "active" | "paused"; anomalies?: Anomaly[]; dailyBudget?: number } = {},
): CampaignAssessment {
  const fatigue = opts.fatigue ?? "healthy";
  return {
    campaign: makeCampaign({ id, name: `Campaign ${id}`, status: opts.status ?? "active", dailyBudget: opts.dailyBudget ?? 100 }),
    totals,
    previous: totals,
    health: healthy,
    fatigue: { score: fatigue === "critical" ? 70 : fatigue === "warning" ? 35 : 0, status: fatigue, signals: [], reasons: ["CTR fell 30% vs. the 14-day baseline"] },
    anomalies: opts.anomalies ?? [],
  };
}

function fixture() {
  const assessments: CampaignAssessment[] = [];
  for (let i = 0; i < 8; i++) {
    const q = 8 - i;
    assessments.push(
      assessment(`cmp_${i}`, makeTotals({ spend: 3000, leads: 100, mqls: 40, sqls: 2 + q * 2, opportunities: q, pipeline: q * 20_000, revenue: q * 4_000 }), {
        fatigue: i === 4 ? "critical" : i === 5 ? "warning" : "healthy",
        anomalies: i === 2 ? [{ campaignId: "cmp_2", date: "2026-09-13", metric: "spend", value: 900, expected: 300, zScore: 7, direction: "spike", severity: "high" }] : [],
      }),
    );
  }
  const benchmark = sumTotals(assessments.map((a) => a.totals));
  const plan = buildBudgetPlan(assessments.map((a) => ({ campaign: a.campaign, totals: a.totals })), benchmark);
  return { assessments, benchmark, plan };
}

const ctx = (benchmark: MetricTotals) => ({
  organizationId: "org_test",
  benchmark,
  windowDays: 30,
  policy: DEFAULT_AUTOMATION_POLICY,
  now: new Date("2026-09-14T00:00:00.000Z"),
});

describe("generateRecommendations", () => {
  const { assessments, benchmark, plan } = fixture();
  resetRecommendationIds();
  const recs = generateRecommendations(assessments, plan, ctx(benchmark));

  it("creates a budget_increase for every plan increase with matching budgetChange", () => {
    const ups = recs.filter((r) => r.type === "budget_increase");
    expect(ups.map((r) => r.campaignId).sort()).toEqual(plan.increases.map((m) => m.campaignId).sort());
    for (const r of ups) {
      const move = plan.increases.find((m) => m.campaignId === r.campaignId)!;
      expect(r.budgetChange).toEqual({ from: move.currentDaily, to: move.proposedDaily, unit: "per_day" });
      expect(r.priority).toBe("high");
      expect(r.expectedImpact.pipelineHigh).toBeGreaterThanOrEqual(r.expectedImpact.pipelineLow);
      expect(r.title).toMatch(/^Increase budget:/);
    }
  });

  it("creates a budget_decrease for every plan decrease", () => {
    const downs = recs.filter((r) => r.type === "budget_decrease");
    expect(downs.map((r) => r.campaignId).sort()).toEqual(plan.decreases.map((m) => m.campaignId).sort());
    for (const r of downs) {
      const move = plan.decreases.find((m) => m.campaignId === r.campaignId)!;
      expect(r.budgetChange!.to).toBeLessThan(r.budgetChange!.from);
      expect(r.budgetChange!.to).toBe(move.proposedDaily);
      expect(r.expectedImpact.wasteAvoided).toBeGreaterThanOrEqual(0);
    }
  });

  it("creates rotate_creative for fatigued campaigns, critical when fatigue is critical", () => {
    const rot = recs.filter((r) => r.type === "rotate_creative");
    expect(rot.map((r) => r.campaignId).sort()).toEqual(["cmp_4", "cmp_5"]);
    const critical = rot.find((r) => r.campaignId === "cmp_4")!;
    expect(critical.priority).toBe("critical");
    expect(critical.title).toMatch(/^Rotate creative now/);
    expect(critical.budgetChange).toEqual({ from: 100, to: 90, unit: "per_day" });
    const warning = rot.find((r) => r.campaignId === "cmp_5")!;
    expect(warning.priority).toBe("medium");
    expect(warning.budgetChange).toBeUndefined();
  });

  it("creates an investigate recommendation for high-severity anomalies that never needs approval", () => {
    const inv = recs.filter((r) => r.type === "investigate");
    expect(inv).toHaveLength(1);
    expect(inv[0].campaignId).toBe("cmp_2");
    expect(inv[0].priority).toBe("high");
    expect(inv[0].requiresApproval).toBe(false);
    expect(inv[0].title).toMatch(/^Spike in spend/);
  });

  it("marks every account-changing recommendation as requiring approval under the default policy", () => {
    const changing = recs.filter((r) => r.type !== "investigate");
    expect(changing.length).toBeGreaterThan(0);
    for (const r of changing) expect(r.requiresApproval).toBe(true);
  });

  it("sorts by priority then by expected pipeline", () => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < recs.length; i++) {
      const a = recs[i - 1];
      const b = recs[i];
      expect(order[a.priority]).toBeLessThanOrEqual(order[b.priority]);
      if (a.priority === b.priority) expect(a.expectedImpact.pipelineHigh).toBeGreaterThanOrEqual(b.expectedImpact.pipelineHigh);
    }
    expect(recs[0].priority).toBe("critical");
  });

  it("fills in provenance fields and unique ids", () => {
    const ids = new Set(recs.map((r) => r.id));
    expect(ids.size).toBe(recs.length);
    for (const r of recs) {
      expect(r.organizationId).toBe("org_test");
      expect(r.status).toBe("pending");
      expect(r.createdAt).toBe("2026-09-14T00:00:00.000Z");
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      expect(r.whatHappened.length).toBeGreaterThan(0);
      expect(r.why.length).toBeGreaterThan(0);
      expect(r.recommendedAction.length).toBeGreaterThan(0);
    }
  });

  it("skips fatigue recommendations for paused campaigns", () => {
    const paused = [assessment("cmp_p", makeTotals(), { fatigue: "critical", status: "paused" })];
    const b = sumTotals(paused.map((a) => a.totals));
    const p = buildBudgetPlan(paused.map((a) => ({ campaign: a.campaign, totals: a.totals })), b);
    const out = generateRecommendations(paused, p, ctx(b));
    expect(out.filter((r) => r.type === "rotate_creative")).toEqual([]);
  });

  it("flags high-CTR / poor-quality campaigns with an audience_shift when not already cut", () => {
    const a = [
      assessment("cmp_hi_ctr", makeTotals({ impressions: 50_000, clicks: 3_000, leads: 200, mqls: 20, sqls: 2, pipeline: 100_000 })),
      assessment("cmp_norm", makeTotals({ impressions: 150_000, clicks: 3_000, leads: 60, mqls: 30, sqls: 12, pipeline: 100_000 })),
      assessment("cmp_norm2", makeTotals({ impressions: 150_000, clicks: 3_000, leads: 60, mqls: 30, sqls: 12, pipeline: 100_000 })),
      assessment("cmp_norm3", makeTotals({ impressions: 150_000, clicks: 3_000, leads: 60, mqls: 30, sqls: 12, pipeline: 100_000 })),
    ];
    const b = sumTotals(a.map((x) => x.totals));
    // Empty plan so the high-CTR campaign is not covered by a budget_decrease.
    const plan = buildBudgetPlan([], b);
    const out = generateRecommendations(a, plan, ctx(b));
    const shift = out.find((r) => r.type === "audience_shift");
    expect(shift).toBeDefined();
    expect(shift!.campaignId).toBe("cmp_hi_ctr");
    expect(shift!.requiresApproval).toBe(true);
  });
});

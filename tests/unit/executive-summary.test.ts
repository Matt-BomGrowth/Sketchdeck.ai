import { describe, it, expect } from "vitest";
import { buildExecutiveSummary } from "@/agent/recommendations/executive-summary";
import { buildBudgetPlan } from "@/agent/optimizers/budget-optimizer";
import { sumTotals } from "@/lib/calculations/metrics";
import { makeCampaign, makeTotals } from "../helpers/series";
import type { CampaignAssessment } from "@/agent/recommendations/next-best-action";
import type { MetricTotals, Platform, Recommendation } from "@/types/domain";

const healthy = { score: 80, status: "healthy" as const, label: "Healthy", components: [] };
const noFatigue = { score: 0, status: "healthy" as const, signals: [], reasons: [] };

function assessment(id: string, platform: Platform, totals: MetricTotals, fatigueStatus: "healthy" | "warning" | "critical" = "healthy"): CampaignAssessment {
  return {
    campaign: makeCampaign({ id, name: `${platform} | ${id} | Test`, platform, dailyBudget: 100 }),
    totals,
    previous: totals,
    health: healthy,
    fatigue: { ...noFatigue, status: fatigueStatus, score: fatigueStatus === "healthy" ? 0 : 65 },
    anomalies: [],
  };
}

const assessments = [
  assessment("li_a", "linkedin", makeTotals({ spend: 4000, pipeline: 200_000, sqls: 20 })),
  assessment("li_b", "linkedin", makeTotals({ spend: 4000, pipeline: 150_000, sqls: 15 })),
  assessment("g_a", "google", makeTotals({ spend: 4000, pipeline: 80_000, sqls: 8 })),
  assessment("m_a", "meta", makeTotals({ spend: 4000, pipeline: 10_000, sqls: 1 }), "critical"),
  assessment("m_b", "meta", makeTotals({ spend: 4000, pipeline: 12_000, sqls: 1 }), "warning"),
];
const current = sumTotals(assessments.map((a) => a.totals));
const byPlatform = new Map<Platform, MetricTotals>();
for (const p of ["google", "meta", "linkedin"] as Platform[]) {
  byPlatform.set(p, sumTotals(assessments.filter((a) => a.campaign.platform === p).map((a) => a.totals)));
}
const plan = buildBudgetPlan(assessments.map((a) => ({ campaign: a.campaign, totals: a.totals })), current);

function budgetRec(campaignId: string, low: number, high: number): Recommendation {
  return {
    id: `rec_${campaignId}`,
    organizationId: "org_test",
    campaignId,
    type: "budget_increase",
    priority: "high",
    title: "Increase",
    whatHappened: "",
    why: "",
    recommendedAction: "",
    expectedImpact: { pipelineLow: low, pipelineHigh: high },
    confidence: 0.7,
    status: "pending",
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  };
}

describe("buildExecutiveSummary", () => {
  it("writes a pipeline change sentence derived from the totals", () => {
    const previous = { ...current, pipeline: current.pipeline / 1.25 }; // +25%
    const s = buildExecutiveSummary({ windowLabel: "last 30 days", current, previous, byPlatform, assessments, plan, recommendations: [] });
    expect(s.pipelineChange).toBeCloseTo(0.25);
    expect(s.sentences[0]).toMatch(/^Pipeline increased 25% over the last 30 days/);

    const down = buildExecutiveSummary({ windowLabel: "last 30 days", current, previous: { ...current, pipeline: current.pipeline * 2 }, byPlatform, assessments, plan, recommendations: [] });
    expect(down.sentences[0]).toMatch(/^Pipeline decreased 50% over the last 30 days/);

    const flat = buildExecutiveSummary({ windowLabel: "last 30 days", current, previous: current, byPlatform, assessments, plan, recommendations: [] });
    expect(flat.sentences[0]).toMatch(/^Pipeline was flat over the last 30 days/);
  });

  it("mentions the reallocation and sums the opportunity when the plan has increases", () => {
    const recs = plan.increases.map((m, i) => budgetRec(m.campaignId, 10_000 * (i + 1), 20_000 * (i + 1)));
    const s = buildExecutiveSummary({ windowLabel: "last 30 days", current, previous: current, byPlatform, assessments, plan, recommendations: recs });
    expect(plan.increases.length).toBeGreaterThan(0);
    expect(s.reallocation).toBe(plan.totalMovePeriod);
    expect(s.opportunityLow).toBe(recs.reduce((a, r) => a + r.expectedImpact.pipelineLow, 0));
    expect(s.opportunityHigh).toBe(recs.reduce((a, r) => a + r.expectedImpact.pipelineHigh, 0));
    const sentence = s.sentences.find((x) => /AI recommends reallocating/.test(x));
    expect(sentence).toBeDefined();
    expect(sentence).toMatch(new RegExp(`toward ${plan.increases.length} high-performing campaign`));
    expect(sentence).toMatch(/Estimated pipeline opportunity/);
  });

  it("compares channel efficiency and counts fatigue by platform", () => {
    const s = buildExecutiveSummary({ windowLabel: "last 30 days", current, previous: current, byPlatform, assessments, plan, recommendations: [] });
    expect(s.sentences.some((x) => /^LinkedIn Ads .*more pipeline per dollar than Meta Ads\.$/.test(x))).toBe(true);
    expect(s.fatigueCount).toEqual({ critical: 1, warning: 1 });
    expect(s.sentences.some((x) => /^2 Meta campaigns show creative fatigue \(1 critical\)\.$/.test(x))).toBe(true);
  });

  it("describes a channel with almost no pipeline instead of an inflated ratio", () => {
    const dead = new Map(byPlatform);
    dead.set("meta", { ...byPlatform.get("meta")!, pipeline: 100 }); // ROAS ≈ 0.01×
    const s = buildExecutiveSummary({ windowLabel: "last 30 days", current, previous: current, byPlatform: dead, assessments, plan, recommendations: [] });
    const sentence = s.sentences.find((x) => /^LinkedIn Ads/.test(x))!;
    expect(sentence).toMatch(/pipeline ROAS, while Meta Ads produced almost no pipeline from \$8\.0K of spend\.$/);
    expect(sentence).not.toMatch(/× more pipeline per dollar/);
  });

  it("adds an SQL sentence only when SQLs move materially", () => {
    const s = buildExecutiveSummary({ windowLabel: "last 30 days", current, previous: { ...current, sqls: Math.round(current.sqls / 2) }, byPlatform, assessments, plan, recommendations: [] });
    expect(s.sentences.some((x) => /^SQLs \+\d+%/.test(x))).toBe(true);
    const quiet = buildExecutiveSummary({ windowLabel: "last 30 days", current, previous: { ...current, sqls: current.sqls + 1 }, byPlatform, assessments, plan, recommendations: [] });
    expect(quiet.sentences.some((x) => /^SQLs/.test(x))).toBe(false);
  });

  it("degrades gracefully with no data", () => {
    const zero = sumTotals([]);
    const emptyPlan = buildBudgetPlan([], zero);
    const s = buildExecutiveSummary({ windowLabel: "last 30 days", current: zero, previous: zero, byPlatform: new Map(), assessments: [], plan: emptyPlan, recommendations: [] });
    expect(s.sentences).toEqual(["Pipeline was flat over the last 30 days at $0."]);
    expect(s.reallocation).toBe(0);
  });
});

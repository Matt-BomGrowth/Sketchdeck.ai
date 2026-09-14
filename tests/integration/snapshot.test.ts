import { describe, it, expect } from "vitest";
import { buildSnapshot } from "@/lib/analytics/snapshot";
import { generateDemoDataset } from "@/data/demo/generate";
import { DEFAULT_AUTOMATION_POLICY } from "@/agent/actions/policy";

const END = "2026-09-13";
const ds = generateDemoDataset(END);

function snapshot(windowDays = 30) {
  return buildSnapshot({
    organization: ds.organization,
    campaigns: ds.campaigns,
    dailyMetrics: ds.dailyMetrics,
    creatives: ds.creatives,
    creativeDailyMetrics: ds.creativeDailyMetrics,
    audienceSegments: ds.audienceSegments,
    endDate: END,
    windowDays,
    now: new Date("2026-09-14T00:00:00.000Z"),
  });
}

describe("buildSnapshot over demo data (30 days)", () => {
  const snap = snapshot(30);

  it("computes a 30-day window with positive spend and a previous window", () => {
    expect(snap.window.days).toBe(30);
    expect(snap.window.end).toBe(END);
    expect(snap.previousWindow.end < snap.window.start).toBe(true);
    expect(snap.totals.spend).toBeGreaterThan(0);
    expect(snap.previousTotals.spend).toBeGreaterThan(0);
    expect(snap.totals.pipeline).toBeGreaterThan(0);
  });

  it("returns an 8-stage funnel", () => {
    expect(snap.funnel).toHaveLength(8);
    expect(snap.funnel[0].stage).toBe("impressions");
    expect(snap.funnel[7].stage).toBe("revenue");
    expect(snap.funnel[0].volume).toBe(snap.totals.impressions);
  });

  it("produces recommendations and a multi-sentence executive summary", () => {
    expect(snap.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(snap.summary.sentences.length).toBeGreaterThanOrEqual(2);
    for (const s of snap.summary.sentences) expect(s.length).toBeGreaterThan(10);
  });

  it("reports alert counts that are non-negative", () => {
    expect(snap.alerts.critical).toBeGreaterThanOrEqual(0);
    expect(snap.alerts.warnings).toBeGreaterThanOrEqual(0);
    expect(snap.alerts.anomalies).toBeGreaterThanOrEqual(0);
  });

  it("builds a Top-3 budget plan that requires approval", () => {
    expect(snap.plan.top).toHaveLength(3);
    expect(snap.plan.requiresApproval).toBe(true);
    expect(snap.plan.increases).toHaveLength(3);
    expect(snap.plan.bottom.length).toBeGreaterThan(0);
    expect(snap.plan.top.every((t) => t.campaign.status === "active")).toBe(true);
    // Critically fatigued campaigns are never scaled up.
    const critical = new Set(snap.campaigns.filter((c) => c.fatigue.status === "critical").map((c) => c.campaign.id));
    for (const t of snap.plan.top) expect(critical.has(t.campaign.id)).toBe(false);
  });

  it("returns one campaign row per dataset campaign with metrics and rank", () => {
    expect(snap.campaigns).toHaveLength(ds.campaigns.length);
    expect(snap.ranked).toHaveLength(ds.campaigns.length);
    for (const row of snap.campaigns) {
      expect(row.qualityRank).toBeGreaterThanOrEqual(1);
      expect(row.health.score).toBeGreaterThanOrEqual(0);
      expect(row.health.score).toBeLessThanOrEqual(100);
      expect(["healthy", "warning", "critical"]).toContain(row.fatigue.status);
    }
  });

  it("marks every recommendation with a budgetChange as requiring approval", () => {
    const withBudget = snap.recommendations.filter((r) => r.budgetChange);
    expect(withBudget.length).toBeGreaterThan(0);
    for (const r of withBudget) expect(r.requiresApproval).toBe(true);
    expect(snap.policy).toEqual(DEFAULT_AUTOMATION_POLICY);
  });

  it("ranks pipeline quality above CTR: the low-CTR enterprise campaign outranks the high-CTR lead form", () => {
    const rank = (id: string) => snap.campaigns.find((c) => c.campaign.id === id)!.qualityRank;
    expect(rank("cmp_l_vp_enterprise")).toBeLessThan(rank("cmp_m_lead_form"));
  });

  it("fills analyzer reports", () => {
    expect(snap.leadQuality.channels.length).toBe(3);
    expect(snap.leadQuality.bestSqlChannel).toBeDefined();
    expect(snap.icp.byDimension.seniority.length).toBeGreaterThan(0);
    expect(snap.creatives.items.length).toBe(ds.creatives.length);
    expect(snap.whyChanged.metric).toBe("pipeline");
    expect(snap.whyChanged.windowLabel).toBe("the last 7 days");
    expect(snap.whyChangedWindow.windowLabel).toBe("last 30 days");
    expect(snap.whyChanged.headline.length).toBeGreaterThan(0);
    expect(snap.series.length).toBe(30);
    expect(snap.platformSeries.google.length).toBe(30);
    expect(snap.derived.pipelineRoas).toBeGreaterThan(0);
  });

  it("is deterministic across runs", () => {
    const again = snapshot(30);
    expect(again.totals).toEqual(snap.totals);
    expect(again.recommendations.map((r) => r.id)).toEqual(snap.recommendations.map((r) => r.id));
    expect(again.summary.sentences).toEqual(snap.summary.sentences);
  });
});

describe("buildSnapshot with other windows", () => {
  it("supports a 7-day window", () => {
    const snap = snapshot(7);
    expect(snap.window.days).toBe(7);
    expect(snap.totals.spend).toBeGreaterThan(0);
    expect(snap.funnel).toHaveLength(8);
    expect(snap.series.length).toBe(30); // chart series is at least 30 days
  });
});

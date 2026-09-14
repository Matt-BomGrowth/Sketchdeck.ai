import { describe, it, expect } from "vitest";
import { computeHealthScore, healthStatus, healthLabel } from "@/agent/analyzers/health-score";
import { makeTotals } from "../helpers/series";
import type { MetricTotals } from "@/types/domain";

// Portfolio benchmark: moderate CTR, moderate pipeline.
const benchmark: MetricTotals = {
  spend: 20_000,
  impressions: 800_000,
  clicks: 20_000, // CTR 2.5%
  leads: 800,
  mqls: 300,
  sqls: 80,
  opportunities: 25,
  pipeline: 500_000, // 25x pipeline ROAS
  revenue: 100_000,
};

describe("computeHealthScore", () => {
  it("ranks a low-CTR / excellent-pipeline campaign above a high-CTR / poor-pipeline one", () => {
    const pipelineQuality = makeTotals({
      spend: 3000,
      impressions: 300_000,
      clicks: 2_700, // CTR 0.9% (well below benchmark)
      leads: 150,
      mqls: 80,
      sqls: 30,
      opportunities: 12,
      pipeline: 240_000, // 80x pipeline ROAS
      revenue: 60_000,
    });
    const highCtr = makeTotals({
      spend: 3000,
      impressions: 50_000,
      clicks: 3_100, // CTR 6.2%
      leads: 230,
      mqls: 45,
      sqls: 3,
      opportunities: 1,
      pipeline: 6_000, // 2x pipeline ROAS
      revenue: 600,
    });
    const a = computeHealthScore(pipelineQuality, { benchmark });
    const b = computeHealthScore(highCtr, { benchmark });
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.status).toBe("healthy");
    expect(["at_risk", "critical"]).toContain(b.status);
  });

  it("gives CTR a small weight relative to pipeline components", () => {
    const { components } = computeHealthScore(makeTotals(), { benchmark });
    const ctr = components.find((c) => c.key === "ctr")!;
    const pipe = components.find((c) => c.key === "pipeline_roas")!;
    expect(ctr.weight).toBeLessThan(pipe.weight);
    const pipelineWeight = components
      .filter((c) => ["pipeline_roas", "revenue_roas", "cost_per_sql", "sql_rate", "opportunity_rate"].includes(c.key))
      .reduce((s, c) => s + c.weight, 0);
    expect(pipelineWeight).toBeGreaterThan(0.6);
  });

  it("stays within 0..100 for extreme inputs", () => {
    const stellar = computeHealthScore(
      makeTotals({ spend: 1000, impressions: 10_000, clicks: 1_000, leads: 500, mqls: 400, sqls: 300, opportunities: 200, pipeline: 5_000_000, revenue: 2_000_000 }),
      { benchmark, impressionTrend: 1, historicalPipelineRoas: 0.001, frequency: 1 },
    );
    const awful = computeHealthScore(
      makeTotals({ spend: 10_000, impressions: 10_000_000, clicks: 100, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 }),
      { benchmark, impressionTrend: -0.9, historicalPipelineRoas: 100, frequency: 9 },
    );
    expect(stellar.score).toBeLessThanOrEqual(100);
    expect(stellar.score).toBeGreaterThanOrEqual(0);
    expect(awful.score).toBeLessThanOrEqual(100);
    expect(awful.score).toBeGreaterThanOrEqual(0);
    expect(stellar.score).toBeGreaterThan(awful.score);
  });

  it("pulls low-data campaigns toward a neutral 50", () => {
    const stellarUnits = { spend: 1000, impressions: 10_000, clicks: 1_000, leads: 500, mqls: 400, sqls: 300, opportunities: 200, pipeline: 5_000_000, revenue: 2_000_000 };
    const withData = computeHealthScore(makeTotals(stellarUnits), { benchmark });
    // Same ratios but only $10 of spend.
    const scaled = Object.fromEntries(Object.entries(stellarUnits).map(([k, v]) => [k, v / 100])) as unknown as MetricTotals;
    const lowData = computeHealthScore(scaled, { benchmark });
    expect(withData.score).toBeGreaterThan(80);
    expect(Math.abs(lowData.score - 50)).toBeLessThan(Math.abs(withData.score - 50));
    expect(lowData.score).toBeLessThan(withData.score);
  });

  it("adds optional components only when context is supplied", () => {
    const base = computeHealthScore(makeTotals(), { benchmark });
    const rich = computeHealthScore(makeTotals(), { benchmark, impressionTrend: -0.5, historicalPipelineRoas: 30, frequency: 5 });
    const keys = (h: typeof base) => h.components.map((c) => c.key);
    expect(keys(base)).not.toContain("frequency");
    expect(keys(base)).not.toContain("impression_trend");
    expect(keys(base)).not.toContain("historical");
    expect(keys(rich)).toContain("frequency");
    expect(keys(rich)).toContain("impression_trend");
    expect(keys(rich)).toContain("historical");
  });

  it("returns a neutral score when benchmark is empty", () => {
    const h = computeHealthScore(makeTotals(), { benchmark: { spend: 0, impressions: 0, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 } });
    expect(h.score).toBe(50);
    expect(h.status).toBe("at_risk");
  });
});

describe("healthStatus thresholds", () => {
  it("maps scores to statuses at the documented boundaries", () => {
    expect(healthStatus(100)).toBe("healthy");
    expect(healthStatus(70)).toBe("healthy");
    expect(healthStatus(69)).toBe("watch");
    expect(healthStatus(55)).toBe("watch");
    expect(healthStatus(54)).toBe("at_risk");
    expect(healthStatus(40)).toBe("at_risk");
    expect(healthStatus(39)).toBe("critical");
    expect(healthStatus(0)).toBe("critical");
  });

  it("labels match statuses", () => {
    expect(healthLabel(80)).toBe("Healthy");
    expect(healthLabel(60)).toBe("Watch");
    expect(healthLabel(45)).toBe("At risk");
    expect(healthLabel(10)).toBe("Critical");
  });
});

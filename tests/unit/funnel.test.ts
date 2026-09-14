import { describe, it, expect } from "vitest";
import { buildFunnel, funnelRates, FUNNEL_STAGES } from "@/lib/calculations/funnel";
import type { MetricTotals } from "@/types/domain";

const totals: MetricTotals = {
  spend: 2000,
  impressions: 100_000,
  clicks: 2_000,
  leads: 100,
  mqls: 40,
  sqls: 10,
  opportunities: 4,
  pipeline: 80_000,
  revenue: 20_000,
};

describe("buildFunnel", () => {
  const funnel = buildFunnel(totals);

  it("returns 8 stages in canonical order", () => {
    expect(funnel.map((s) => s.stage)).toEqual([
      "impressions",
      "clicks",
      "leads",
      "mqls",
      "sqls",
      "opportunities",
      "pipeline",
      "revenue",
    ]);
    expect(funnel.map((s) => s.stage)).toEqual(FUNNEL_STAGES.map((s) => s.stage));
  });

  it("reports volume for each stage", () => {
    const byStage = Object.fromEntries(funnel.map((s) => [s.stage, s]));
    expect(byStage.impressions.volume).toBe(100_000);
    expect(byStage.clicks.volume).toBe(2_000);
    expect(byStage.leads.volume).toBe(100);
    expect(byStage.pipeline.volume).toBe(80_000);
    expect(byStage.revenue.volume).toBe(20_000);
  });

  it("computes conversion from the previous stage", () => {
    const byStage = Object.fromEntries(funnel.map((s) => [s.stage, s]));
    expect(byStage.impressions.conversionFromPrevious).toBeNull();
    expect(byStage.clicks.conversionFromPrevious).toBeCloseTo(0.02);
    expect(byStage.leads.conversionFromPrevious).toBeCloseTo(0.05);
    expect(byStage.mqls.conversionFromPrevious).toBeCloseTo(0.4);
    expect(byStage.sqls.conversionFromPrevious).toBeCloseTo(0.25);
    expect(byStage.opportunities.conversionFromPrevious).toBeCloseTo(0.4);
  });

  it("computes cost per stage for volume stages and null for money stages", () => {
    const byStage = Object.fromEntries(funnel.map((s) => [s.stage, s]));
    expect(byStage.impressions.costPer).toBeCloseTo(0.02);
    expect(byStage.clicks.costPer).toBe(1);
    expect(byStage.leads.costPer).toBe(20);
    expect(byStage.mqls.costPer).toBe(50);
    expect(byStage.sqls.costPer).toBe(200);
    expect(byStage.opportunities.costPer).toBe(500);
    expect(byStage.pipeline.costPer).toBeNull();
    expect(byStage.revenue.costPer).toBeNull();
  });

  it("reports pipeline → revenue conversion on the revenue stage", () => {
    const byStage = Object.fromEntries(funnel.map((s) => [s.stage, s]));
    expect(byStage.pipeline.conversionFromPrevious).toBeNull();
    expect(byStage.revenue.conversionFromPrevious).toBeCloseTo(0.25);
  });

  it("attaches monetary value to opportunities, pipeline and revenue", () => {
    const byStage = Object.fromEntries(funnel.map((s) => [s.stage, s]));
    expect(byStage.opportunities.value).toBe(80_000);
    expect(byStage.pipeline.value).toBe(80_000);
    expect(byStage.revenue.value).toBe(20_000);
    expect(byStage.clicks.value).toBeNull();
  });

  it("is safe on all-zero totals (no NaN / Infinity)", () => {
    const zero = buildFunnel({ spend: 0, impressions: 0, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 });
    for (const s of zero) {
      expect(s.conversionFromPrevious).toBeNull();
      expect(s.costPer).toBeNull();
      expect(Number.isFinite(s.volume)).toBe(true);
    }
  });
});

describe("funnelRates", () => {
  it("computes stage-to-stage rates", () => {
    const r = funnelRates(totals);
    expect(r.clickToLead).toBeCloseTo(0.05);
    expect(r.leadToMql).toBeCloseTo(0.4);
    expect(r.mqlToSql).toBeCloseTo(0.25);
    expect(r.sqlToOpp).toBeCloseTo(0.4);
    expect(r.pipelinePerOpp).toBe(20_000);
    expect(r.winRate).toBeCloseTo(0.25);
  });

  it("returns nulls when denominators are zero", () => {
    const r = funnelRates({ ...totals, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0 });
    expect(r.clickToLead).toBeNull();
    expect(r.leadToMql).toBeNull();
    expect(r.mqlToSql).toBeNull();
    expect(r.sqlToOpp).toBeNull();
    expect(r.pipelinePerOpp).toBeNull();
    expect(r.winRate).toBeNull();
  });
});

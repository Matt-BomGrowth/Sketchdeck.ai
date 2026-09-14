import { describe, it, expect } from "vitest";
import {
  safeDivide,
  ctr,
  cpc,
  cpl,
  costPerMql,
  costPerSql,
  costPerOpportunity,
  roas,
  pipelineRoas,
  mqlRate,
  sqlRate,
  opportunityRate,
  revenuePerLead,
  leadToSqlRate,
  deriveMetrics,
  sumTotals,
  pctChange,
  EMPTY_TOTALS,
} from "@/lib/calculations/metrics";
import type { MetricTotals } from "@/types/domain";

const totals: MetricTotals = {
  spend: 1000,
  impressions: 50_000,
  clicks: 1_000,
  leads: 50,
  mqls: 20,
  sqls: 5,
  opportunities: 2,
  pipeline: 40_000,
  revenue: 8_000,
};

describe("metrics: core ratios", () => {
  it("computes CTR, CPC and CPL", () => {
    expect(ctr(1_000, 50_000)).toBeCloseTo(0.02);
    expect(cpc(1000, 1_000)).toBe(1);
    expect(cpl(1000, 50)).toBe(20);
  });

  it("computes cost per MQL / SQL / opportunity", () => {
    expect(costPerMql(1000, 20)).toBe(50);
    expect(costPerSql(1000, 5)).toBe(200);
    expect(costPerOpportunity(1000, 2)).toBe(500);
  });

  it("computes ROAS and pipeline ROAS", () => {
    expect(roas(8_000, 1000)).toBe(8);
    expect(pipelineRoas(40_000, 1000)).toBe(40);
  });

  it("computes MQL, SQL and opportunity rates", () => {
    expect(mqlRate(20, 50)).toBeCloseTo(0.4);
    expect(sqlRate(5, 20)).toBeCloseTo(0.25);
    expect(opportunityRate(2, 5)).toBeCloseTo(0.4);
    expect(leadToSqlRate(5, 50)).toBeCloseTo(0.1);
  });

  it("computes revenue per lead", () => {
    expect(revenuePerLead(8_000, 50)).toBe(160);
  });
});

describe("metrics: zero-value safety", () => {
  it("returns null when the denominator is zero, never Infinity or NaN", () => {
    expect(ctr(10, 0)).toBeNull();
    expect(cpc(100, 0)).toBeNull();
    expect(cpl(100, 0)).toBeNull();
    expect(costPerMql(100, 0)).toBeNull();
    expect(costPerSql(100, 0)).toBeNull();
    expect(roas(100, 0)).toBeNull();
    expect(pipelineRoas(100, 0)).toBeNull();
    expect(mqlRate(3, 0)).toBeNull();
    expect(sqlRate(3, 0)).toBeNull();
    expect(opportunityRate(3, 0)).toBeNull();
    expect(revenuePerLead(3, 0)).toBeNull();
    expect(safeDivide(0, 0)).toBeNull();
  });

  it("returns null for non-finite inputs", () => {
    expect(safeDivide(Infinity, 2)).toBeNull();
    expect(safeDivide(2, NaN)).toBeNull();
  });

  it("deriveMetrics on EMPTY_TOTALS yields all nulls and no NaN/Infinity", () => {
    const d = deriveMetrics(EMPTY_TOTALS);
    for (const v of Object.values(d)) {
      expect(v).toBeNull();
    }
  });

  it("deriveMetrics on real totals produces finite numbers", () => {
    const d = deriveMetrics(totals);
    for (const v of Object.values(d)) {
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(d.ctr).toBeCloseTo(0.02);
    expect(d.costPerSql).toBe(200);
    expect(d.pipelineRoas).toBe(40);
  });
});

describe("metrics: sumTotals", () => {
  it("sums every additive field", () => {
    const out = sumTotals([totals, totals]);
    expect(out.spend).toBe(2000);
    expect(out.impressions).toBe(100_000);
    expect(out.clicks).toBe(2_000);
    expect(out.leads).toBe(100);
    expect(out.mqls).toBe(40);
    expect(out.sqls).toBe(10);
    expect(out.opportunities).toBe(4);
    expect(out.pipeline).toBe(80_000);
    expect(out.revenue).toBe(16_000);
    expect(out.frequency).toBeUndefined();
  });

  it("treats missing fields as zero", () => {
    const out = sumTotals([{ spend: 5 }, { clicks: 3 }]);
    expect(out.spend).toBe(5);
    expect(out.clicks).toBe(3);
    expect(out.leads).toBe(0);
  });

  it("returns EMPTY_TOTALS-shaped zeros for no rows", () => {
    expect(sumTotals([])).toEqual(EMPTY_TOTALS);
  });

  it("weights frequency by impressions", () => {
    const out = sumTotals([
      { impressions: 1000, frequency: 2 },
      { impressions: 3000, frequency: 4 },
    ]);
    // (2*1000 + 4*3000) / 4000 = 3.5
    expect(out.frequency).toBeCloseTo(3.5);
  });

  it("ignores frequency on rows with zero impressions", () => {
    const out = sumTotals([
      { impressions: 0, frequency: 10 },
      { impressions: 1000, frequency: 2 },
    ]);
    expect(out.frequency).toBeCloseTo(2);
  });

  it("does not mutate EMPTY_TOTALS", () => {
    sumTotals([totals]);
    expect(EMPTY_TOTALS.spend).toBe(0);
  });
});

describe("metrics: pctChange", () => {
  it("computes relative change", () => {
    expect(pctChange(120, 100)).toBeCloseTo(0.2);
    expect(pctChange(80, 100)).toBeCloseTo(-0.2);
  });

  it("uses absolute baseline for negative previous values", () => {
    expect(pctChange(-50, -100)).toBeCloseTo(0.5);
  });

  it("returns 0 when both are zero and null when only previous is zero", () => {
    expect(pctChange(0, 0)).toBe(0);
    expect(pctChange(10, 0)).toBeNull();
  });

  it("returns null for non-finite input", () => {
    expect(pctChange(NaN, 10)).toBeNull();
    expect(pctChange(10, Infinity)).toBeNull();
  });
});

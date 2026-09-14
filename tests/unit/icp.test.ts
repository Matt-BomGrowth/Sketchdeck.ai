import { describe, it, expect } from "vitest";
import { analyzeIcp, DIMENSION_LABEL } from "@/agent/analyzers/icp";
import type { AudienceSegmentMetric } from "@/types/domain";

function seg(dimension: AudienceSegmentMetric["dimension"], value: string, spend: number, pipeline: number, sqls = 5): AudienceSegmentMetric {
  return { dimension, value, spend, impressions: spend * 40, clicks: spend / 8, leads: spend / 50, mqls: spend / 100, sqls, opportunities: 1, pipeline, revenue: pipeline * 0.2 };
}

describe("analyzeIcp", () => {
  it("surfaces an over/under-index insight when pipeline share diverges from spend share", () => {
    const segments: AudienceSegmentMetric[] = [
      // Owner/C-level: 20% of spend but 60% of pipeline → under-invested (index 3).
      seg("seniority", "Owner / C-level", 2_000, 60_000, 12),
      // Individual contributor: 50% of spend but 10% of pipeline → over-invested (index 0.2).
      seg("seniority", "Individual contributor", 5_000, 10_000, 1),
      seg("seniority", "Manager", 3_000, 30_000, 4),
    ];
    const report = analyzeIcp(segments);
    const rows = report.byDimension.seniority;
    expect(rows).toHaveLength(3);
    // Sorted by pipeline desc.
    expect(rows[0].value).toBe("Owner / C-level");
    expect(rows[0].spendShare).toBeCloseTo(0.2);
    expect(rows[0].pipelineShare).toBeCloseTo(0.6);
    expect(rows[0].index).toBeCloseTo(3);
    const ic = rows.find((r) => r.value === "Individual contributor")!;
    expect(ic.index).toBeCloseTo(0.2);

    const insight = report.insights.find((s) => /Owner \/ C-level/.test(s));
    expect(insight).toBeDefined();
    expect(insight).toMatch(/60% of pipeline comes from Owner \/ C-level \(seniority\)/);
    expect(insight).toMatch(/over-index toward Individual contributor \(50% of spend for 10% of pipeline\)/);
    expect(report.recommendations).toContain("Increase Owner / C-level targeting; reduce exposure to Individual contributor.");
  });

  it("falls back to a concentration insight when a segment dominates without a mismatch", () => {
    const segments: AudienceSegmentMetric[] = [
      seg("industry", "Structural Steel", 6_000, 60_000),
      seg("industry", "Metal Buildings", 4_000, 40_000),
    ];
    const report = analyzeIcp(segments);
    expect(report.insights).toEqual(["Structural Steel drives 60% of pipeline across industry segments."]);
    expect(report.recommendations).toEqual([]);
  });

  it("returns empty rows for every dimension when there are no segments", () => {
    const report = analyzeIcp([]);
    for (const dim of Object.keys(DIMENSION_LABEL) as Array<keyof typeof DIMENSION_LABEL>) {
      expect(report.byDimension[dim]).toEqual([]);
    }
    expect(report.insights).toEqual([]);
  });

  it("computes per-segment efficiency metrics without NaN", () => {
    const report = analyzeIcp([seg("geography", "Texas", 1_000, 20_000, 4), seg("geography", "Ontario", 0, 0, 0)]);
    const tx = report.byDimension.geography.find((r) => r.value === "Texas")!;
    expect(tx.pipelineRoas).toBe(20);
    expect(tx.costPerSql).toBe(250);
    const on = report.byDimension.geography.find((r) => r.value === "Ontario")!;
    expect(on.index).toBeNull();
    expect(on.pipelineRoas).toBeNull();
  });
});

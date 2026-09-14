import { describe, it, expect } from "vitest";
import { generateDemoDataset } from "@/data/demo/generate";
import { DEMO_CAMPAIGNS } from "@/data/demo/campaigns";
import { PROFILES } from "@/data/demo/profiles";
import { sumTotals } from "@/lib/calculations/metrics";
import { dateRange } from "@/lib/utils/dates";
import type { PerformanceProfile, Platform } from "@/types/domain";

const END = "2026-09-13";
const ds = generateDemoDataset(END);
const INT_FIELDS = ["impressions", "clicks", "leads", "mqls", "sqls", "opportunities", "pipeline", "revenue"] as const;

describe("generateDemoDataset", () => {
  it("is deterministic for the same end date", () => {
    const again = generateDemoDataset(END);
    expect(sumTotals(again.dailyMetrics)).toEqual(sumTotals(ds.dailyMetrics));
    expect(again.dailyMetrics).toEqual(ds.dailyMetrics);
    expect(again.creativeDailyMetrics).toEqual(ds.creativeDailyMetrics);
    expect(again.audienceSegments).toEqual(ds.audienceSegments);
    expect(again.campaigns).toEqual(ds.campaigns);
  });

  it("has 20–30 campaigns across all three platforms", () => {
    expect(ds.campaigns.length).toBeGreaterThanOrEqual(20);
    expect(ds.campaigns.length).toBeLessThanOrEqual(30);
    const platforms = new Set(ds.campaigns.map((c) => c.platform));
    for (const p of ["google", "meta", "linkedin"] as Platform[]) expect(platforms.has(p)).toBe(true);
    expect(new Set(ds.campaigns.map((c) => c.id)).size).toBe(ds.campaigns.length);
    expect(ds.campaigns.every((c) => c.organizationId === ds.organization.id)).toBe(true);
  });

  it("generates exactly 120 days of history for every campaign", () => {
    expect(ds.historyDays).toBe(120);
    expect(ds.endDate).toBe(END);
    const days = dateRange(ds.startDate, ds.endDate);
    expect(days).toHaveLength(120);
    expect(ds.dailyMetrics).toHaveLength(ds.campaigns.length * 120);
    for (const c of ds.campaigns) {
      const dates = ds.dailyMetrics.filter((m) => m.campaignId === c.id).map((m) => m.date).sort();
      expect(dates).toEqual(days);
    }
  });

  it("every DailyMetric has non-negative integer counts and a monotone funnel", () => {
    for (const m of ds.dailyMetrics) {
      expect(m.spend).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(m.spend)).toBe(true);
      for (const f of INT_FIELDS) {
        expect(Number.isInteger(m[f])).toBe(true);
        expect(m[f]).toBeGreaterThanOrEqual(0);
      }
      expect(m.impressions).toBeGreaterThanOrEqual(m.clicks);
      expect(m.clicks).toBeGreaterThanOrEqual(m.leads);
      expect(m.leads).toBeGreaterThanOrEqual(m.mqls);
      expect(m.mqls).toBeGreaterThanOrEqual(m.sqls);
      expect(m.sqls).toBeGreaterThanOrEqual(m.opportunities);
      if (typeof m.frequency === "number") expect(m.frequency).toBeGreaterThan(0);
    }
  });

  it("creative daily metrics sum to the campaign row for sampled campaigns and dates", () => {
    const samples: Array<[string, string]> = [
      ["cmp_g_core_phrases", END],
      ["cmp_l_vp_enterprise", "2026-08-20"],
      ["cmp_m_lead_form", "2026-07-01"],
      ["cmp_g_pmax", "2026-09-10"],
    ];
    for (const [campaignId, date] of samples) {
      const row = ds.dailyMetrics.find((m) => m.campaignId === campaignId && m.date === date)!;
      expect(row).toBeDefined();
      const creativeIds = new Set(ds.creatives.filter((c) => c.campaignId === campaignId).map((c) => c.id));
      expect(creativeIds.size).toBeGreaterThan(0);
      const rows = ds.creativeDailyMetrics.filter((m) => creativeIds.has(m.creativeId) && m.date === date);
      expect(rows).toHaveLength(creativeIds.size);
      const sum = sumTotals(rows);
      expect(Math.abs(sum.spend - row.spend)).toBeLessThanOrEqual(0.05);
      for (const f of INT_FIELDS) expect(sum[f]).toBe(row[f]);
      for (const r of rows) {
        expect(r.spend).toBeGreaterThanOrEqual(0);
        for (const f of INT_FIELDS) {
          expect(Number.isInteger(r[f])).toBe(true);
          expect(r[f]).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("audience segments cover all five dimensions with non-negative totals", () => {
    const dims = new Set(ds.audienceSegments.map((s) => s.dimension));
    expect([...dims].sort()).toEqual(["company_size", "geography", "industry", "job_title", "seniority"]);
    for (const s of ds.audienceSegments) {
      expect(s.value.length).toBeGreaterThan(0);
      expect(s.spend).toBeGreaterThanOrEqual(0);
      expect(s.pipeline).toBeGreaterThanOrEqual(0);
      expect(s.leads).toBeGreaterThanOrEqual(s.mqls);
    }
    // Segment spend within a dimension should roughly match total 90-day spend.
    const last90 = ds.dailyMetrics.filter((m) => m.date >= "2026-06-16" && m.date <= END);
    const total = sumTotals(last90).spend;
    for (const dim of dims) {
      const dimSpend = ds.audienceSegments.filter((s) => s.dimension === dim).reduce((a, s) => a + s.spend, 0);
      expect(Math.abs(dimSpend - total) / total).toBeLessThan(0.01);
    }
  });

  it("demo creatives carry no fabricated assets", () => {
    expect(ds.creatives.length).toBeGreaterThan(0);
    for (const c of ds.creatives) {
      expect(c.assetStatus).toBe("demo");
      expect(c.assetUrl).toBeUndefined();
      expect(c.headline.length).toBeGreaterThan(0);
      expect(ds.campaigns.some((k) => k.id === c.campaignId)).toBe(true);
    }
    expect(new Set(ds.creatives.map((c) => c.id)).size).toBe(ds.creatives.length);
  });

  it("uses every PerformanceProfile and profiles exist for all seven", () => {
    const all: PerformanceProfile[] = [
      "high_performing",
      "average",
      "underperforming",
      "fatiguing",
      "high_ctr_poor_quality",
      "low_ctr_excellent_pipeline",
      "high_cpl_excellent_sql",
    ];
    for (const p of all) {
      expect(PROFILES[p]).toBeDefined();
      expect(PROFILES[p].ctr).toBeGreaterThan(0);
      expect(PROFILES[p].cpc).toBeGreaterThan(0);
    }
    expect(Object.keys(PROFILES).sort()).toEqual([...all].sort());
    const used = new Set(ds.campaigns.map((c) => c.profile));
    for (const p of all) expect(used.has(p)).toBe(true);
    expect(DEMO_CAMPAIGNS.every((d) => all.includes(d.profile))).toBe(true);
  });

  it("paused campaigns stop spending after their early run", () => {
    const paused = ds.campaigns.filter((c) => c.status === "paused");
    expect(paused.length).toBeGreaterThan(0);
    for (const c of paused) {
      const recent = ds.dailyMetrics.filter((m) => m.campaignId === c.id && m.date > "2026-08-01");
      expect(recent.every((m) => m.spend === 0 && m.impressions === 0)).toBe(true);
    }
  });

  it("differentiates the low-CTR / excellent-pipeline profile from the high-CTR / poor-quality one", () => {
    const totalsFor = (profile: PerformanceProfile) => {
      const ids = new Set(ds.campaigns.filter((c) => c.profile === profile && c.status === "active").map((c) => c.id));
      return sumTotals(ds.dailyMetrics.filter((m) => ids.has(m.campaignId) && m.date > "2026-08-14"));
    };
    const lowCtr = totalsFor("low_ctr_excellent_pipeline");
    const highCtr = totalsFor("high_ctr_poor_quality");
    expect(lowCtr.clicks / lowCtr.impressions).toBeLessThan(highCtr.clicks / highCtr.impressions);
    expect(lowCtr.pipeline / lowCtr.spend).toBeGreaterThan(highCtr.pipeline / highCtr.spend);
  });
});

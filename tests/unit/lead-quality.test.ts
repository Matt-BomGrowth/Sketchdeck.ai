import { describe, it, expect } from "vitest";
import { analyzeLeadQuality } from "@/agent/analyzers/lead-quality";
import type { MetricTotals, Platform } from "@/types/domain";

const meta: MetricTotals = {
  spend: 5_000,
  impressions: 400_000,
  clicks: 20_000,
  leads: 500, // CPL $10
  mqls: 60,
  sqls: 5, // cost/SQL $1,000, lead→SQL 1%
  opportunities: 1,
  pipeline: 8_000,
  revenue: 0,
};

const linkedin: MetricTotals = {
  spend: 10_000,
  impressions: 150_000,
  clicks: 1_500,
  leads: 100, // CPL $100
  mqls: 60,
  sqls: 25, // cost/SQL $400, lead→SQL 25%
  opportunities: 9,
  pipeline: 250_000,
  revenue: 50_000,
};

describe("analyzeLeadQuality", () => {
  const byPlatform = new Map<Platform, MetricTotals>([
    ["meta", meta],
    ["linkedin", linkedin],
    ["google", { spend: 0, impressions: 0, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 }],
  ]);
  const report = analyzeLeadQuality(byPlatform);

  it("identifies LinkedIn as the best SQL channel and Meta as the cheapest-lead channel", () => {
    expect(report.bestSqlChannel).toBe("linkedin");
    expect(report.cheapestLeadChannel).toBe("meta");
  });

  it("skips channels with no spend", () => {
    expect(report.channels.map((c) => c.platform)).not.toContain("google");
    expect(report.channels).toHaveLength(2);
  });

  it("orders channels by pipeline ROAS", () => {
    expect(report.channels[0].platform).toBe("linkedin");
  });

  it("produces an insight sentence that mentions both channels and the cost trade-off", () => {
    const sentence = report.insights.find((s) => /LinkedIn Ads/.test(s) && /Meta Ads/.test(s));
    expect(sentence).toBeDefined();
    expect(sentence).toMatch(/cost 10\.0× more/);
    expect(sentence).toMatch(/SQLs 2\.5× cheaper/);
    expect(sentence).toMatch(/\$100/);
    expect(sentence).toMatch(/\$10/);
    expect(sentence).toMatch(/\$400/);
    expect(sentence).toMatch(/\$1,000/);
  });

  it("flags volume-without-qualification channels", () => {
    expect(report.insights.some((s) => /Meta Ads: only 1\.0% of leads become SQLs/.test(s))).toBe(true);
  });

  it("compares pipeline per dollar between best and worst", () => {
    expect(report.insights.some((s) => /LinkedIn Ads generates .*× more pipeline per dollar than Meta Ads/.test(s))).toBe(true);
  });

  it("describes a channel with almost no pipeline instead of an inflated ratio", () => {
    const dead = new Map<Platform, MetricTotals>([
      ["meta", { ...meta, pipeline: 100 }], // ROAS 0.02×
      ["linkedin", linkedin],
    ]);
    const r = analyzeLeadQuality(dead);
    const sentence = r.insights.find((s) => /LinkedIn Ads generates/.test(s))!;
    expect(sentence).toBe("LinkedIn Ads generates 25.0× pipeline ROAS; Meta Ads produced almost no pipeline from $5,000 of spend.");
  });

  it("handles an empty map", () => {
    const empty = analyzeLeadQuality(new Map());
    expect(empty.channels).toEqual([]);
    expect(empty.insights).toEqual([]);
    expect(empty.bestSqlChannel).toBeUndefined();
    expect(empty.cheapestLeadChannel).toBeUndefined();
  });

  it("reports the single cheapest SQL channel when best-SQL and cheapest-lead agree", () => {
    const one = analyzeLeadQuality(new Map<Platform, MetricTotals>([["linkedin", linkedin]]));
    expect(one.bestSqlChannel).toBe("linkedin");
    expect(one.cheapestLeadChannel).toBe("linkedin");
    expect(one.insights[0]).toMatch(/LinkedIn Ads produces the cheapest SQLs at \$400/);
  });
});

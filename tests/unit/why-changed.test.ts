import { describe, it, expect } from "vitest";
import { explainChange } from "@/agent/analyzers/why-changed";
import { windowEnding, previousWindow } from "@/lib/utils/dates";
import { buildSeries, makeCampaign } from "../helpers/series";
import type { DailyMetric } from "@/types/domain";

const END = "2026-09-13";
const current = windowEnding(END, 7, "last 7 days");
const previous = previousWindow(current);

const campaigns = [
  makeCampaign({ id: "cmp_dropped", name: "Dropped Campaign", platform: "meta" }),
  makeCampaign({ id: "cmp_steady", name: "Steady Campaign" }),
  makeCampaign({ id: "cmp_small_dip", name: "Small Dip" }),
];

function rows(): DailyMetric[] {
  // Dropped: pipeline goes from 1 opp/day ($20K) to 0 in the current window, CPC rising.
  const dropped = buildSeries("cmp_dropped", END, 14, (_, daysFromEnd) =>
    daysFromEnd < 7 ? { sqlToOpp: 0, cpc: 12, leadToMql: 0.2 } : { sqlToOpp: 1, cpc: 8, leadToMql: 0.4 },
  );
  const steady = buildSeries("cmp_steady", END, 14, () => ({ sqlToOpp: 1 }));
  // Small dip: one opp less over the window (deal size halves on 1 of 7 days isn't expressible, so lower dealSize slightly).
  const dip = buildSeries("cmp_small_dip", END, 14, (_, daysFromEnd) => (daysFromEnd < 7 ? { sqlToOpp: 1, dealSize: 19_000 } : { sqlToOpp: 1, dealSize: 20_000 }));
  return [...dropped, ...steady, ...dip];
}

describe("explainChange", () => {
  const report = explainChange(campaigns, rows(), current, previous);

  it("detects a pipeline decline and names the metric in the headline", () => {
    expect(report.metric).toBe("pipeline");
    expect(report.metricLabel).toBe("Pipeline");
    expect(report.direction).toBe("down");
    expect(report.change).toBeLessThan(0);
    expect(report.headline).toMatch(/^Pipeline declined/);
    expect(report.headline).toMatch(/last 7 days vs\. the previous 7 days/);
    expect(report.windowLabel).toBe("last 7 days");
  });

  it("attributes the majority share of the decline to the campaign that dropped", () => {
    expect(report.contributors[0].campaign.id).toBe("cmp_dropped");
    expect(report.contributors[0].shareOfChange).toBeGreaterThan(0.5);
    expect(report.contributors[0].delta).toBeLessThan(0);
    expect(report.headline).toMatch(/of the decline came from Dropped Campaign/);
    // Steady campaign has no delta and is not listed.
    expect(report.contributors.find((c) => c.campaign.id === "cmp_steady")).toBeUndefined();
  });

  it("explains drivers and yields a non-empty recommendation per contributor", () => {
    const top = report.contributors[0];
    expect(top.drivers.length).toBeGreaterThan(0);
    expect(top.drivers.some((d) => d.key === "cpc" && d.hurts)).toBe(true);
    expect(top.drivers.some((d) => d.key === "mql_rate" && d.hurts)).toBe(true);
    for (const c of report.contributors) {
      expect(typeof c.recommendation).toBe("string");
      expect(c.recommendation.length).toBeGreaterThan(0);
    }
    expect(top.recommendation).toMatch(/Rising CPC with weaker MQL conversion/);
  });

  it("prefers fatigue-based advice when a fatigue assessment is supplied", () => {
    const fatigueByCampaign = new Map([["cmp_dropped", { score: 70, status: "critical" as const, signals: [], reasons: [] }]]);
    const r = explainChange(campaigns, rows(), current, previous, { fatigueByCampaign });
    const top = r.contributors[0];
    expect(top.drivers.some((d) => d.key === "fatigue")).toBe(true);
    expect(top.recommendation).toMatch(/Rotate the fatigued creative/);
  });

  it("reports flat when nothing changed", () => {
    const flat = explainChange(campaigns.slice(1, 2), buildSeries("cmp_steady", END, 14, () => ({ sqlToOpp: 1 })), current, previous);
    expect(flat.direction).toBe("flat");
    expect(flat.headline).toBe("Pipeline was flat last 7 days vs. the previous 7 days.");
    expect(flat.contributors).toEqual([]);
  });

  it("supports non-monetary headline metrics", () => {
    const r = explainChange(campaigns, rows(), current, previous, { metric: "mqls" });
    expect(r.metricLabel).toBe("MQLs");
    expect(r.headline).toMatch(/^MQLs declined \d+% last 7 days vs\. the previous 7 days \(\d+ → \d+\)/);
  });
});

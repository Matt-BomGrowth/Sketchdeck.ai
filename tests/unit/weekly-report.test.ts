import { describe, expect, it } from "vitest";
import { buildWeeklyReport, compareMetric, rates, sumAdTotals, type AdTotals } from "@/lib/reports/weekly";
import { nextFocus, weeklySummary } from "@/lib/reports/weekly-narrative";
import { previousWindow, windowEnding } from "@/lib/utils/dates";
import { makeCampaign } from "../helpers/series";
import type { Creative, CreativeDailyMetric, DailyMetric } from "@/types/domain";

const window = windowEnding("2026-09-14", 7);
const previous = previousWindow(window);

function day(campaignId: string, date: string, over: Partial<DailyMetric> = {}): DailyMetric {
  return { campaignId, date, spend: 100, impressions: 5000, clicks: 150, leads: 5, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0, ...over };
}

/** 7 days in the window and 7 in the previous period for a campaign, with per-period overrides. */
function fortnight(campaignId: string, cur: Partial<DailyMetric>, prev: Partial<DailyMetric>): DailyMetric[] {
  const out: DailyMetric[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(day(campaignId, addDays(window.start, i), cur));
    out.push(day(campaignId, addDays(previous.start, i), prev));
  }
  return out;
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const campaigns = [
  makeCampaign({ id: "g1", name: "Google | Core Phrases", platform: "google" }),
  makeCampaign({ id: "g2", name: "Google | Brand", platform: "google" }),
  makeCampaign({ id: "m1", name: "Meta | Retargeting", platform: "meta" }),
];

describe("rates and blending", () => {
  it("derives CTR, CPC, CPM and cost per conversion from totals, never from averaged rates", () => {
    const r = rates({ spend: 1000, impressions: 40_000, clicks: 800, conversions: 20, reach: null, frequency: null });
    expect(r.ctr).toBeCloseTo(0.02, 6);
    expect(r.cpc).toBe(1.25);
    expect(r.cpm).toBe(25);
    expect(r.costPerConversion).toBe(50);
    expect(rates({ spend: 0, impressions: 0, clicks: 0, conversions: 0, reach: null, frequency: null }).ctr).toBeNull();
  });

  it("sums reach only where a platform reports frequency and keeps frequency impression-weighted", () => {
    const google: AdTotals = { spend: 500, impressions: 10_000, clicks: 300, conversions: 10, reach: null, frequency: null };
    const meta: AdTotals = { spend: 300, impressions: 20_000, clicks: 200, conversions: 5, reach: 8000, frequency: 2.5 };
    const blended = sumAdTotals([google, meta]);
    expect(blended.spend).toBe(800);
    expect(blended.reach).toBe(8000);
    expect(blended.frequency).toBe(2.5);
    expect(sumAdTotals([google]).reach).toBeNull();
  });

  it("interprets direction per metric: lower cost per conversion is better, higher spend is neutral", () => {
    const cur = { totals: { spend: 1200, impressions: 50_000, clicks: 1000, conversions: 30, reach: null, frequency: null } };
    const prev = { totals: { spend: 1000, impressions: 40_000, clicks: 800, conversions: 20, reach: null, frequency: null } };
    const c = (k: Parameters<typeof compareMetric>[0]) => compareMetric(k, { ...cur, rates: rates(cur.totals) }, { ...prev, rates: rates(prev.totals) });
    expect(c("spend")).toMatchObject({ change: 0.2, verdict: "neutral" });
    expect(c("conversions")).toMatchObject({ change: 0.5, verdict: "better" });
    expect(c("costPerConversion").verdict).toBe("better"); // $50 → $40
    expect(c("cpc").verdict).toBe("better"); // $1.25 → $1.20
    expect(c("reach")).toMatchObject({ current: null, verdict: "unknown" });
  });
});

describe("buildWeeklyReport", () => {
  const dailyMetrics = [
    ...fortnight("g1", { spend: 200, impressions: 8000, clicks: 240, leads: 8 }, { spend: 150, impressions: 7000, clicks: 210, leads: 5 }),
    ...fortnight("g2", { spend: 50, impressions: 2000, clicks: 80, leads: 3 }, { spend: 60, impressions: 2100, clicks: 85, leads: 3 }),
    ...fortnight(
      "m1",
      { spend: 120, impressions: 30_000, clicks: 300, leads: 2, frequency: 3.4 },
      { spend: 100, impressions: 24_000, clicks: 260, leads: 4, frequency: 2.6 },
    ),
  ];
  const creatives: Creative[] = [
    {
      id: "ad1",
      campaignId: "g1",
      platform: "google",
      externalId: "1",
      name: "Core · RSA 1",
      type: "text",
      status: "active",
      headline: "Steel Takeoffs in Minutes",
      primaryText: "Book a demo",
      assetStatus: "unavailable",
      headlines: ["Steel Takeoffs in Minutes", "AI Steel Estimating"],
      descriptions: ["Book a demo"],
      landingUrl: "https://sketchdeck.ai/lift",
    },
    {
      id: "ad2",
      campaignId: "g1",
      platform: "google",
      externalId: "2",
      name: "Core · RSA 2",
      type: "text",
      status: "active",
      headline: "Still Counting Manually?",
      primaryText: "Try free",
      assetStatus: "unavailable",
    },
  ];
  const creativeDailyMetrics: CreativeDailyMetric[] = [];
  for (let i = 0; i < 7; i++) {
    creativeDailyMetrics.push({
      creativeId: "ad1",
      date: addDays(window.start, i),
      spend: 150,
      impressions: 6000,
      clicks: 180,
      leads: 6,
      mqls: 0,
      sqls: 0,
      opportunities: 0,
      pipeline: 0,
      revenue: 0,
    });
    creativeDailyMetrics.push({
      creativeId: "ad2",
      date: addDays(window.start, i),
      spend: 50,
      impressions: 2000,
      clicks: 60,
      leads: 0,
      mqls: 0,
      sqls: 0,
      opportunities: 0,
      pipeline: 0,
      revenue: 0,
    });
    creativeDailyMetrics.push({
      creativeId: "ad1",
      date: addDays(previous.start, i),
      spend: 150,
      impressions: 7000,
      clicks: 210,
      leads: 5,
      mqls: 0,
      sqls: 0,
      opportunities: 0,
      pipeline: 0,
      revenue: 0,
    });
  }
  const report = buildWeeklyReport({
    campaigns,
    dailyMetrics,
    creatives,
    creativeDailyMetrics,
    window,
    previous,
    integrations: [{ key: "notfair", name: "NotFair", health: "connected", detail: "Connected: SketchDeck (2175229247)" }],
    lastSyncAt: "2026-09-15T12:00:00Z",
  });

  it("blends totals across platforms and compares with the previous period", () => {
    expect(report.blended.current.spend).toBe(7 * 370);
    expect(report.blended.previous.spend).toBe(7 * 310);
    expect(report.blended.current.conversions).toBe(7 * 13);
    expect(report.blended.spendChange).toBeCloseTo(60 / 310, 6);
    expect(report.blended.rates.ctr).toBeCloseTo((7 * 620) / (7 * 40_000), 8);
    // Reach/frequency come only from the Meta rows.
    expect(report.blended.current.frequency).toBe(3.4);
    expect(report.blended.current.reach).toBe(Math.round((7 * 30_000) / 3.4));
    const spendMetric = report.blended.metrics.find((m) => m.key === "spend")!;
    expect(spendMetric.verdict).toBe("neutral");
  });

  it("attributes the spend delta to platforms", () => {
    const google = report.platforms.find((p) => p.platform === "google")!;
    const meta = report.platforms.find((p) => p.platform === "meta")!;
    const linkedin = report.platforms.find((p) => p.platform === "linkedin")!;
    // Google +40/day of a +60/day blended delta.
    expect(google.shareOfSpendDelta).toBeCloseTo(40 / 60, 6);
    expect(meta.shareOfSpendDelta).toBeCloseTo(20 / 60, 6);
    expect(google.connected).toBe(true);
    expect(meta.connected).toBe(true); // has spend
    expect(linkedin.connected).toBe(false);
    expect(google.current.reach).toBeNull();
  });

  it("produces campaign and ad rows sorted by spend with WoW deltas", () => {
    expect(report.campaigns.map((c) => c.id)).toEqual(["g1", "m1", "g2"]);
    const g1 = report.campaigns[0];
    expect(g1.spendChange).toBeCloseTo(1 / 3, 6);
    expect(g1.conversionsChange).toBeCloseTo(0.6, 6);
    expect(g1.costPerConversionChange).toBeCloseTo(200 / 8 / (150 / 5) - 1, 6);
    const m1 = report.campaigns[1];
    expect(m1.frequencyChange).toBeCloseTo(3.4 / 2.6 - 1, 6);
    expect(report.ads.map((a) => a.creative.id)).toEqual(["ad1", "ad2"]);
    expect(report.ads[1].previous.spend).toBe(0);
    expect(report.ads[1].spendChange).toBeNull();
  });

  it("builds a day-aligned trend and honest integrity notes", () => {
    expect(report.trend).toHaveLength(7);
    expect(report.trend[0].previousDate).toBe(previous.start);
    expect(report.trend[0].current.spend).toBe(370);
    expect(report.trend[0].previous.spend).toBe(310);
    expect(report.trend[0].current.ctr).toBeCloseTo(620 / 40_000, 8);
    expect(report.integrity.sources[0]).toMatch(/NotFair/);
    expect(report.integrity.notes.join(" ")).toMatch(/LinkedIn Ads is not connected/);
    expect(report.integrity.notes.join(" ")).toMatch(/Ad-level rows cover/);
    expect(report.integrity.lastSyncAt).toBe("2026-09-15T12:00:00Z");
  });

  it("writes a factual summary that names the driver platform and standout campaigns", () => {
    const s = weeklySummary(report);
    expect(s[0]).toMatch(/spend went up 19%/);
    expect(s[0]).toMatch(/conversions went up/);
    expect(s.join(" ")).toMatch(/Google Ads accounted for 67% of the increase in spend/);
    expect(s.join(" ")).toMatch(/Meta Ads moved the other way on conversions \(down 50%\)/);
    expect(s.join(" ")).toMatch(/Meta \| Retargeting lost the most \(28 → 14\)/);
    expect(s.join(" ")).toMatch(/Google \| Brand had the strongest conversion efficiency/);
    expect(s.join(" ")).toMatch(/CTR/);
    expect(s.every((x) => !/good|bad/i.test(x))).toBe(true);
  });

  it("lists data-driven next-focus items", () => {
    const items = nextFocus(report);
    const ids = items.map((i) => i.id.split(":")[0]);
    expect(ids).toContain("spend-up-conv-down"); // Meta: +20% spend, 28 → 14 conversions
    expect(ids).toContain("ad-spend-few-conv"); // ad2: $350, 0 conversions
    expect(ids).toContain("best-cpa"); // Brand $16.67 vs blended
    // One line per campaign: Meta's frequency climb folds into its spend-up / conversions-down item.
    const meta = items.find((i) => i.campaignId === "m1")!;
    expect(meta.id).toMatch(/^spend-up-conv-down/);
    expect(meta.detail).toMatch(/Also: frequency 2\.6 → 3\.4/);
    expect(items.filter((i) => i.campaignId === "m1")).toHaveLength(1);
    expect(items[0].id).toMatch(/^spend-up-conv-down/); // priority order, not spend order
    expect(items.length).toBeLessThanOrEqual(8);
  });

  it("names the movers when platforms pull in opposite directions instead of a share of the net change", () => {
    const mixed = buildWeeklyReport({
      campaigns,
      dailyMetrics: [
        ...fortnight("g1", { spend: 100, leads: 5 }, { spend: 200, leads: 5 }), // −$700
        ...fortnight("m1", { spend: 250, leads: 5, frequency: 2 }, { spend: 200, leads: 5, frequency: 2 }), // +$350
      ],
      creatives: [],
      creativeDailyMetrics: [],
      window,
      previous,
      integrations: [],
    });
    const s = weeklySummary(mixed).join(" ");
    expect(s).toMatch(/Google Ads \(−\$700\) spent less while Meta Ads \(\+\$350\) spent more, netting −\$350/);
    expect(s).not.toMatch(/accounted for/);
  });

  it("handles a first period with no comparison data", () => {
    const first = buildWeeklyReport({
      campaigns,
      dailyMetrics: dailyMetrics.filter((m) => m.date >= window.start),
      creatives: [],
      creativeDailyMetrics: [],
      window,
      previous,
      integrations: [],
    });
    expect(first.blended.spendChange).toBeNull();
    expect(weeklySummary(first)[0]).toMatch(/no data for the previous period/);
    expect(
      weeklySummary(buildWeeklyReport({ campaigns, dailyMetrics: [], creatives: [], creativeDailyMetrics: [], window, previous, integrations: [] }))[0],
    ).toMatch(/No ad spend/);
  });
});

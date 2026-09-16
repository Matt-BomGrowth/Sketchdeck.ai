import { describe, expect, it } from "vitest";
import {
  channelOverview,
  crmOverview,
  ga4Overview,
  googleAdsSignals,
  keywordTable,
  matchTypeBreakdown,
  searchConsoleOverview,
  searchTermTable,
  seoSignals,
  timeline,
} from "@/lib/analytics/channel-detail";
import { crmFunnelDaily } from "@/integrations/crm-funnel";
import { windowEnding, previousWindow } from "@/lib/utils/dates";
import { makeCampaign } from "../helpers/series";
import type { CrmFunnelDailyMetric, Ga4DailyMetric, KeywordDailyMetric, SearchConsoleDailyMetric, SearchTermDailyMetric } from "@/types/domain";

const window = windowEnding("2026-09-14", 7);
const previous = previousWindow(window);

function kw(over: Partial<KeywordDailyMetric>): KeywordDailyMetric {
  return {
    campaignId: "c1",
    adGroupExternalId: "ag1",
    adGroupName: "Steel Takeoff",
    adGroupStatus: "active",
    externalId: "k1",
    keywordText: "steel takeoff software",
    matchType: "PHRASE",
    status: "active",
    qualityScore: 7,
    date: "2026-09-10",
    spend: 50,
    impressions: 500,
    clicks: 20,
    conversions: 1,
    conversionValue: 450,
    topImpressionPct: 0.5,
    searchImpressionShare: 0.3,
    ...over,
  };
}

describe("keywordTable", () => {
  it("aggregates the window and previous period per keyword with impression-weighted shares", () => {
    const rows = [
      kw({ date: "2026-09-10", impressions: 100, topImpressionPct: 1, searchImpressionShare: 0.2, qualityScore: 6 }),
      kw({ date: "2026-09-12", impressions: 300, topImpressionPct: 0.5, searchImpressionShare: 0.6, qualityScore: 8 }),
      kw({ date: "2026-09-03", spend: 10, clicks: 2, conversions: 0 }), // previous period
      kw({ date: "2026-08-20", spend: 999 }), // outside both
      kw({ externalId: "k2", keywordText: "sketchdeck", matchType: "EXACT", date: "2026-09-11", spend: 5 }),
    ];
    const table = keywordTable(rows, window, previous);
    expect(table).toHaveLength(2);
    const first = table[0];
    expect(first.keywordText).toBe("steel takeoff software");
    expect(first.current.spend).toBe(100);
    expect(first.current.impressions).toBe(400);
    expect(first.previous.spend).toBe(10);
    expect(first.previous.conversions).toBe(0);
    expect(first.qualityScore).toBe(8); // latest in window
    expect(first.topImpressionPct).toBeCloseTo((100 * 1 + 300 * 0.5) / 400, 6);
    expect(first.searchImpressionShare).toBeCloseTo((100 * 0.2 + 300 * 0.6) / 400, 6);
    expect(first.derived.ctr).toBeCloseTo(40 / 400, 6);
    expect(first.derived.cpa).toBe(50);
    const mt = matchTypeBreakdown(table);
    expect(mt.map((m) => m.matchType)).toEqual(["EXACT", "PHRASE"]);
    expect(mt[1].current.spend).toBe(100);
  });
});

describe("googleAdsSignals", () => {
  const campaigns = new Map([["c1", makeCampaign({ id: "c1", name: "Core Phrases" })]]);
  const account = { spend: 2000, impressions: 40_000, clicks: 800, conversions: 20, conversionValue: 0 }; // CPA $100, CTR 2%

  it("flags wasted spend, high CPA, low quality score and low CTR keywords", () => {
    const rows = keywordTable(
      [
        kw({
          externalId: "waste",
          keywordText: "free estimating software",
          date: "2026-09-10",
          spend: 500,
          clicks: 60,
          conversions: 0,
          qualityScore: 5,
          impressions: 3000,
        }),
        kw({
          externalId: "cpa",
          keywordText: "steel estimator",
          date: "2026-09-10",
          spend: 500,
          clicks: 50,
          conversions: 1,
          qualityScore: 5,
          impressions: 2000,
        }),
        kw({ externalId: "qs", keywordText: "estimating", date: "2026-09-10", spend: 120, clicks: 10, conversions: 2, qualityScore: 2, impressions: 400 }),
        kw({ externalId: "ctr", keywordText: "takeoff", date: "2026-09-10", spend: 20, clicks: 2, conversions: 1, qualityScore: 8, impressions: 1000 }),
        kw({
          externalId: "fine",
          keywordText: "structural steel takeoff",
          date: "2026-09-10",
          spend: 300,
          clicks: 40,
          conversions: 5,
          qualityScore: 8,
          impressions: 2000,
        }),
      ],
      window,
      previous,
    );
    const signals = googleAdsSignals(rows, [], account, campaigns);
    const ids = signals.map((s) => s.id.split(":")[0]);
    expect(ids).toContain("kw-waste");
    expect(ids).toContain("kw-cpa");
    expect(ids).toContain("kw-qs");
    expect(ids).toContain("kw-ctr");
    expect(signals.find((s) => s.title.includes("structural steel takeoff"))).toBeUndefined();
    expect(signals.find((s) => s.id.startsWith("kw-waste"))?.severity).toBe("critical"); // ≥ 3× floor ($150)
  });

  it("proposes negatives for non-converting search terms and new keywords for converting ones", () => {
    const st = (over: Partial<SearchTermDailyMetric>): SearchTermDailyMetric => ({
      campaignId: "c1",
      adGroupExternalId: "ag1",
      adGroupName: "Steel Takeoff",
      searchTerm: "x",
      status: "NONE",
      keywordText: "steel takeoff software",
      matchType: "PHRASE",
      date: "2026-09-10",
      spend: 0,
      impressions: 10,
      clicks: 0,
      conversions: 0,
      conversionValue: 0,
      ...over,
    });
    const terms = searchTermTable(
      [
        st({ searchTerm: "steel takeoff software jobs", spend: 120, clicks: 15 }),
        st({ searchTerm: "steel takeoff software jobs", date: "2026-09-11", spend: 30, clicks: 4 }),
        st({ searchTerm: "already excluded", status: "EXCLUDED", spend: 200, clicks: 20 }),
        st({ searchTerm: "best steel takeoff software", spend: 90, clicks: 12, conversions: 3 }),
        st({ searchTerm: "already added", status: "ADDED", spend: 90, clicks: 12, conversions: 3 }),
      ],
      window,
      previous,
    );
    expect(terms[0].searchTerm).toBe("already excluded"); // sorted by spend
    const signals = googleAdsSignals([], terms, account, campaigns);
    expect(signals.map((s) => s.title)).toEqual(
      expect.arrayContaining(['Add negative: "steel takeoff software jobs"', 'Add keyword: "best steel takeoff software"']),
    );
    expect(signals.find((s) => s.title.includes("already"))).toBeUndefined();
    expect(signals.every((s) => s.kind === "opportunity")).toBe(true);
  });
});

describe("ga4Overview / searchConsoleOverview / crmOverview", () => {
  it("compares channels, landing pages and key events across periods", () => {
    const g = (over: Partial<Ga4DailyMetric>): Ga4DailyMetric => ({
      date: "2026-09-10",
      dimension: "channel",
      value: "Organic Search",
      subValue: "",
      sessions: 100,
      users: 90,
      newUsers: 60,
      engagedSessions: 55,
      keyEvents: 2,
      ...over,
    });
    const rows = [
      g({}),
      g({ date: "2026-09-12", sessions: 150, keyEvents: 3 }),
      g({ date: "2026-09-03", sessions: 80 }),
      g({ value: "Direct", sessions: 40, keyEvents: 0 }),
      g({ dimension: "landing_page", value: "/", sessions: 120, keyEvents: 4 }),
      g({ dimension: "key_event", value: "Organic Search", subValue: "hubspot_form_submit", sessions: 0, keyEvents: 3 }),
      g({ dimension: "key_event", value: "Organic Search", subValue: "hubspot_form_submit", date: "2026-09-02", sessions: 0, keyEvents: 1 }),
    ];
    const o = ga4Overview(rows, window, previous);
    expect(o.available).toBe(true);
    expect(o.totals.current.sessions).toBe(290);
    expect(o.totals.previous.sessions).toBe(80);
    expect(o.channels[0]).toMatchObject({ channel: "Organic Search" });
    expect(o.channels[0].current.sessions).toBe(250);
    expect(o.landingPages[0].page).toBe("/");
    expect(o.keyEvents[0]).toMatchObject({ event: "hubspot_form_submit", current: { count: 3 }, previous: { count: 1 } });
    expect(o.keyEventsByChannel[0]).toEqual({ channel: "Organic Search", event: "hubspot_form_submit", count: 3 });
  });

  it("weights Search Console position by impressions and finds striking-distance queries", () => {
    const s = (over: Partial<SearchConsoleDailyMetric>): SearchConsoleDailyMetric => ({
      date: "2026-09-10",
      dimension: "query",
      value: "steel takeoff software",
      clicks: 10,
      impressions: 300,
      position: 6,
      ...over,
    });
    const rows = [
      s({ dimension: "site", value: "", clicks: 50, impressions: 2000, position: 8 }),
      s({ dimension: "site", value: "", date: "2026-09-03", clicks: 40, impressions: 1500, position: 9 }),
      s({}),
      s({ date: "2026-09-11", clicks: 5, impressions: 100, position: 10 }),
      s({ value: "sketchdeck", clicks: 100, impressions: 400, position: 1.1 }),
      s({ value: "dropped", clicks: 2, impressions: 50, position: 20 }),
      s({ value: "dropped", date: "2026-09-04", clicks: 30, impressions: 400, position: 5 }),
    ];
    const o = searchConsoleOverview(rows, window, previous);
    expect(o.available).toBe(true);
    expect(o.site.current).toMatchObject({ clicks: 50, impressions: 2000, position: 8 });
    expect(o.site.previous.clicks).toBe(40);
    const q = o.queries.find((x) => x.query === "steel takeoff software")!;
    expect(q.current.position).toBeCloseTo((6 * 300 + 10 * 100) / 400, 1);
    const signals = seoSignals(o);
    expect(signals.map((x) => x.id)).toEqual(expect.arrayContaining(["seo-striking:steel takeoff software", "seo-drop:dropped"]));
    expect(signals.find((x) => x.id.includes("sketchdeck"))).toBeUndefined();
    expect(searchConsoleOverview([], window, previous).available).toBe(false);
  });

  it("aggregates the CRM funnel by original source, keeping amounts on opportunity and closed-won", () => {
    const daily = crmFunnelDaily([
      { externalContactId: "1", stage: "lead", occurredAt: "2026-09-10T10:00:00Z", source: "ORGANIC_SEARCH" },
      { externalContactId: "2", stage: "lead", occurredAt: "2026-09-10T12:00:00Z", source: "organic_search" },
      { externalContactId: "3", stage: "opportunity", occurredAt: "2026-09-11T12:00:00Z", source: "PAID_SEARCH", amount: 40_000 },
      { externalContactId: "4", stage: "closed_won", occurredAt: "2026-09-04T12:00:00Z", source: "PAID_SEARCH", amount: 25_000 },
      { externalContactId: "5", stage: "mql", occurredAt: "2026-09-12T12:00:00Z" },
    ]);
    expect(daily.find((d) => d.source === "ORGANIC_SEARCH" && d.stage === "lead")?.count).toBe(2);
    expect(daily.find((d) => d.source === "UNKNOWN")?.stage).toBe("mql");
    const o = crmOverview(daily, window, previous);
    expect(o.totals.current.lead).toBe(2);
    expect(o.totals.current.pipeline).toBe(40_000);
    expect(o.totals.previous.revenue).toBe(25_000);
    expect(o.bySource.find((r) => r.source === "PAID_SEARCH")?.label).toBe("Paid Search");
  });
});

describe("channelOverview + timeline", () => {
  const campaigns = [makeCampaign({ id: "g", platform: "google" }), makeCampaign({ id: "li", platform: "linkedin" })];
  const dailyMetrics = [
    {
      campaignId: "g",
      date: "2026-09-10",
      spend: 100,
      impressions: 1000,
      clicks: 50,
      leads: 5,
      mqls: 2,
      sqls: 1,
      opportunities: 1,
      pipeline: 20_000,
      revenue: 0,
    },
    { campaignId: "li", date: "2026-09-10", spend: 80, impressions: 500, clicks: 10, leads: 2, mqls: 1, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 },
    { campaignId: "g", date: "2026-09-03", spend: 90, impressions: 900, clicks: 45, leads: 4, mqls: 2, sqls: 1, opportunities: 0, pipeline: 0, revenue: 0 },
  ];
  const ga4Rows: Ga4DailyMetric[] = [
    { date: "2026-09-10", dimension: "channel", value: "Paid Search", subValue: "", sessions: 48, users: 45, newUsers: 40, engagedSessions: 20, keyEvents: 5 },
    { date: "2026-09-10", dimension: "channel", value: "Paid Social", subValue: "", sessions: 9, users: 9, newUsers: 9, engagedSessions: 4, keyEvents: 1 },
    {
      date: "2026-09-10",
      dimension: "channel",
      value: "Organic Search",
      subValue: "",
      sessions: 200,
      users: 180,
      newUsers: 120,
      engagedSessions: 110,
      keyEvents: 4,
    },
    { date: "2026-09-10", dimension: "channel", value: "Unassigned", subValue: "", sessions: 7, users: 7, newUsers: 7, engagedSessions: 1, keyEvents: 0 },
  ];
  const crmRows: CrmFunnelDailyMetric[] = [
    { date: "2026-09-10", source: "ORGANIC_SEARCH", stage: "lead", count: 4, amount: 0 },
    { date: "2026-09-10", source: "ORGANIC_SEARCH", stage: "sql", count: 1, amount: 0 },
    { date: "2026-09-10", source: "ORGANIC_SEARCH", stage: "opportunity", count: 1, amount: 30_000 },
  ];

  it("builds paid rows from platforms and organic rows from GA4 + CRM, marking unconnected platforms", () => {
    const rows = channelOverview({
      campaigns,
      dailyMetrics,
      ga4: ga4Overview(ga4Rows, window, previous),
      crm: crmOverview(crmRows, window, previous),
      window,
      previous,
      connectedPlatforms: new Set(["google", "linkedin"]),
    });
    const google = rows.find((r) => r.key === "google_ads")!;
    expect(google.current).toMatchObject({ spend: 100, clicks: 50, leads: 5, sqls: 1, pipeline: 20_000, sessions: 48, keyEvents: 5 });
    expect(google.previous.spend).toBe(90);
    const meta = rows.find((r) => r.key === "meta_ads")!;
    expect(meta.connected).toBe(false);
    const li = rows.find((r) => r.key === "linkedin_ads")!;
    expect(li.connected).toBe(true);
    expect(li.current.sessions).toBe(9); // only social platform connected → Paid Social sessions are LinkedIn's
    const organic = rows.find((r) => r.key === "organic_search")!;
    expect(organic.current).toMatchObject({ spend: 0, sessions: 200, keyEvents: 4, leads: 4, sqls: 1, pipeline: 30_000 });
    const other = rows.find((r) => r.key === "other")!;
    expect(other.current.sessions).toBe(7);
  });

  it("aligns the previous period by day offset in the timeline", () => {
    const t = timeline({
      dailyMetrics,
      ga4: ga4Rows,
      searchConsole: [{ date: "2026-09-10", dimension: "site", value: "", clicks: 33, impressions: 900, position: 7 }],
      window,
      previous,
    });
    expect(t).toHaveLength(7);
    const day = t.find((p) => p.date === "2026-09-10")!;
    expect(day).toMatchObject({ spend: 180, clicks: 60, leads: 7, sessions: 264, keyEvents: 10, organicClicks: 33, previousDate: "2026-09-03" });
    expect(day.previous.spend).toBe(90);
  });
});

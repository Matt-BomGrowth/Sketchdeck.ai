/**
 * Demo channel detail (keywords, search terms, GA4, Search Console, CRM by
 * source) derived deterministically from the demo campaigns so that every
 * layer of the dashboard reconciles: keyword spend sums to campaign spend,
 * GA4 paid sessions track paid clicks, CRM paid stages track campaign MQL/SQL.
 */

import type {
  CrmFunnelDailyMetric,
  DailyMetric,
  Ga4DailyMetric,
  KeywordDailyMetric,
  KeywordMatchType,
  SearchConsoleDailyMetric,
  SearchTermDailyMetric,
} from "@/types/domain";
import { createRng, hashString } from "@/lib/utils/prng";
import type { DemoDataset } from "./generate";

export interface DemoChannelDetail {
  keywords: KeywordDailyMetric[];
  searchTerms: SearchTermDailyMetric[];
  ga4: Ga4DailyMetric[];
  searchConsole: SearchConsoleDailyMetric[];
  crmFunnel: CrmFunnelDailyMetric[];
}

const KEYWORD_SETS: Record<string, Array<{ adGroup: string; keywords: Array<[string, KeywordMatchType, number]> }>> = {
  cmp_g_core_phrases: [
    {
      adGroup: "Steel Takeoff Software",
      keywords: [
        ["steel takeoff software", "PHRASE", 9],
        ["structural steel takeoff", "EXACT", 8],
        ["takeoff software for fabricators", "BROAD", 5],
        ["steel estimating takeoff", "PHRASE", 6],
      ],
    },
    {
      adGroup: "Estimating Software",
      keywords: [
        ["steel estimating software", "PHRASE", 8],
        ["fabrication estimating software", "EXACT", 7],
        ["estimating software construction", "BROAD", 3],
      ],
    },
  ],
  cmp_g_brand: [
    {
      adGroup: "Brand",
      keywords: [
        ["sketchdeck", "EXACT", 10],
        ["sketchdeck lift", "PHRASE", 9],
        ["sketch deck estimating", "BROAD", 7],
      ],
    },
  ],
  cmp_g_competitors: [
    {
      adGroup: "Competitors",
      keywords: [
        ["tekla estimating", "PHRASE", 4],
        ["sds/2 alternative", "EXACT", 5],
        ["bluebeam takeoff steel", "BROAD", 3],
        ["stack estimating software", "PHRASE", 4],
      ],
    },
  ],
  cmp_g_metal_building: [
    {
      adGroup: "Metal Building",
      keywords: [
        ["metal building estimating software", "PHRASE", 7],
        ["pre-engineered metal building takeoff", "BROAD", 4],
        ["metal building estimator", "EXACT", 6],
      ],
    },
  ],
  cmp_g_structural_est: [
    {
      adGroup: "Structural Steel Estimating",
      keywords: [
        ["structural steel estimating", "PHRASE", 8],
        ["structural estimating software", "EXACT", 7],
        ["steel estimator software", "BROAD", 4],
      ],
    },
  ],
  cmp_g_fab_estimating: [
    {
      adGroup: "Fabrication Estimating",
      keywords: [
        ["fabrication estimating", "PHRASE", 6],
        ["fab shop estimating software", "EXACT", 7],
        ["weld estimating software", "BROAD", 3],
      ],
    },
  ],
};

const SEARCH_TERM_VARIANTS = ["best {kw}", "{kw} pricing", "{kw} free trial", "{kw} for small shops", "ai {kw}", "{kw} reviews", "{kw} vs excel", "{kw} demo"];
const EXCLUDED_TERMS = ["free {kw} download", "{kw} jobs", "{kw} course", "{kw} tutorial pdf"];

const LANDING_PAGES: Array<[string, number]> = [
  ["/", 0.34],
  ["/lift", 0.18],
  ["/pricing", 0.12],
  ["/demo", 0.1],
  ["/blog/steel-takeoff-guide", 0.11],
  ["/blog/estimating-software-comparison", 0.08],
  ["/customers", 0.04],
  ["/integrations", 0.03],
];
const SC_QUERIES: Array<[string, number, number]> = [
  ["sketchdeck", 220, 1.2],
  ["steel takeoff software", 90, 4.8],
  ["structural steel estimating software", 70, 6.1],
  ["steel estimating software", 60, 7.4],
  ["takeoff software", 40, 11.2],
  ["fabrication estimating software", 35, 5.9],
  ["metal building estimating", 30, 9.5],
  ["ai takeoff software", 28, 8.3],
  ["steel estimator", 24, 13.0],
  ["sketchdeck lift", 22, 1.1],
  ["how to estimate structural steel", 20, 6.7],
  ["steel takeoff", 18, 12.5],
  ["estimating software for fabricators", 16, 5.2],
  ["tekla estimating alternative", 12, 14.1],
  ["bluebeam steel takeoff", 10, 17.8],
];
const SC_PAGES: Array<[string, number, number]> = [
  ["https://www.sketchdeck.ai/", 0.4, 3.2],
  ["https://www.sketchdeck.ai/lift", 0.16, 6.4],
  ["https://www.sketchdeck.ai/blog/steel-takeoff-guide", 0.18, 5.1],
  ["https://www.sketchdeck.ai/blog/estimating-software-comparison", 0.12, 7.6],
  ["https://www.sketchdeck.ai/pricing", 0.08, 9.8],
  ["https://www.sketchdeck.ai/customers", 0.06, 12.4],
];

export function buildDemoChannelDetail(ds: DemoDataset): DemoChannelDetail {
  const rng = createRng(hashString(`channel-detail:${ds.endDate}`));
  const byCampaignDay = new Map<string, DailyMetric>();
  for (const m of ds.dailyMetrics) byCampaignDay.set(`${m.campaignId}|${m.date}`, m);
  const dates = [...new Set(ds.dailyMetrics.map((m) => m.date))].sort();
  const platformOf = new Map(ds.campaigns.map((c) => [c.id, c.platform] as const));

  // ── Keywords + search terms ──
  const keywords: KeywordDailyMetric[] = [];
  const searchTerms: SearchTermDailyMetric[] = [];
  for (const [campaignId, adGroups] of Object.entries(KEYWORD_SETS)) {
    const weights = adGroups.flatMap((g, gi) => g.keywords.map((k, ki) => ({ gi, ki, w: k[2] })));
    const wsum = weights.reduce((s, x) => s + x.w, 0);
    const qs = new Map(weights.map((x) => [`${x.gi}:${x.ki}`, Math.max(2, Math.min(10, Math.round(3 + (x.w / 10) * 6 + rng.normal(0, 0.8))))]));
    for (const date of dates) {
      const day = byCampaignDay.get(`${campaignId}|${date}`);
      if (!day) continue;
      let spendLeft = day.spend;
      let imprLeft = day.impressions;
      let clicksLeft = day.clicks;
      let convLeft = day.leads;
      weights.forEach((x, idx) => {
        const g = adGroups[x.gi];
        const [text, matchType] = g.keywords[x.ki];
        const last = idx === weights.length - 1;
        const share = last ? 1 : Math.max(0, Math.min(1, (x.w / wsum) * rng.range(0.7, 1.3)));
        const spend = last ? spendLeft : Math.round(spendLeft * share * 100) / 100;
        const impressions = last ? imprLeft : Math.round(imprLeft * share);
        const clicks = last ? clicksLeft : Math.min(impressions, Math.round(clicksLeft * share));
        const conversions = last ? convLeft : Math.min(clicks, Math.round(convLeft * share));
        spendLeft -= spend;
        imprLeft -= impressions;
        clicksLeft -= clicks;
        convLeft -= conversions;
        const adGroupExternalId = `ag_${campaignId}_${x.gi}`;
        keywords.push({
          campaignId,
          adGroupExternalId,
          adGroupName: g.adGroup,
          adGroupStatus: "active",
          externalId: `kw_${campaignId}_${x.gi}_${x.ki}`,
          keywordText: text,
          matchType,
          status: "active",
          qualityScore: qs.get(`${x.gi}:${x.ki}`),
          date,
          spend: Math.max(0, spend),
          impressions: Math.max(0, impressions),
          clicks: Math.max(0, clicks),
          conversions: Math.max(0, conversions),
          conversionValue: Math.max(0, conversions) * 450,
          topImpressionPct: Math.min(1, Math.max(0.1, 0.35 + x.w / 20 + rng.normal(0, 0.05))),
          searchImpressionShare: Math.min(1, Math.max(0.05, 0.2 + x.w / 25 + rng.normal(0, 0.05))),
        });
        if (impressions <= 0) return;
        const nTerms = rng.int(1, 3);
        let tImpr = impressions;
        let tClicks = clicks;
        let tSpend = spend;
        let tConv = conversions;
        for (let t = 0; t < nTerms; t++) {
          const excluded = rng.next() < 0.12;
          const variant = excluded ? rng.pick(EXCLUDED_TERMS) : SEARCH_TERM_VARIANTS[(idx + t + date.charCodeAt(9)) % SEARCH_TERM_VARIANTS.length];
          const lastT = t === nTerms - 1;
          const f = lastT ? 1 : rng.range(0.25, 0.6);
          const si = lastT ? tImpr : Math.round(tImpr * f);
          const sc = lastT ? tClicks : Math.min(si, Math.round(tClicks * f));
          const ss = lastT ? tSpend : Math.round(tSpend * f * 100) / 100;
          const sv = lastT ? tConv : Math.min(sc, Math.round(tConv * f));
          tImpr -= si;
          tClicks -= sc;
          tSpend -= ss;
          tConv -= sv;
          if (si <= 0) continue;
          searchTerms.push({
            campaignId,
            adGroupExternalId,
            adGroupName: g.adGroup,
            searchTerm: variant.replace("{kw}", text),
            status: excluded ? "EXCLUDED" : t === 0 && x.w >= 7 ? "ADDED" : "NONE",
            keywordText: text,
            matchType,
            date,
            spend: Math.max(0, ss),
            impressions: si,
            clicks: Math.max(0, sc),
            conversions: excluded ? 0 : Math.max(0, sv),
            conversionValue: excluded ? 0 : Math.max(0, sv) * 450,
          });
        }
      });
    }
  }

  // ── GA4 ──
  const ga4: Ga4DailyMetric[] = [];
  const crmFunnel: CrmFunnelDailyMetric[] = [];
  const searchConsole: SearchConsoleDailyMetric[] = [];
  const dayIndex = new Map(dates.map((d, i) => [d, i] as const));
  for (const date of dates) {
    const paid = {
      google: 0,
      social: 0,
      leads: { google: 0, social: 0 },
      mqls: { google: 0, social: 0 },
      sqls: { google: 0, social: 0 },
      opps: { google: 0, social: 0 },
      pipeline: { google: 0, social: 0 },
      revenue: { google: 0, social: 0 },
    };
    for (const m of ds.dailyMetrics) {
      if (m.date !== date) continue;
      const key = platformOf.get(m.campaignId) === "google" ? "google" : "social";
      paid[key] += m.clicks;
      paid.leads[key] += m.leads;
      paid.mqls[key] += m.mqls;
      paid.sqls[key] += m.sqls;
      paid.opps[key] += m.opportunities;
      paid.pipeline[key] += m.pipeline;
      paid.revenue[key] += m.revenue;
    }
    const i = dayIndex.get(date) ?? 0;
    const growth = 1 + (i / Math.max(1, dates.length)) * 0.35; // organic grows over the history
    const weekend = new Date(`${date}T00:00:00Z`).getUTCDay() % 6 === 0 ? 0.55 : 1;
    const organicSessions = Math.round(210 * growth * weekend * rng.range(0.85, 1.15));
    const channels: Array<[string, number, number]> = [
      ["Paid Search", Math.round(paid.google * 0.92), paid.leads.google],
      ["Paid Social", Math.round(paid.social * 0.85), paid.leads.social],
      ["Organic Search", organicSessions, Math.round(organicSessions * 0.028 * rng.range(0.6, 1.4))],
      ["Direct", Math.round(150 * growth * weekend * rng.range(0.85, 1.15)), rng.int(0, 3)],
      ["Referral", Math.round(38 * weekend * rng.range(0.7, 1.3)), rng.int(0, 1)],
      ["Organic Social", Math.round(45 * weekend * rng.range(0.6, 1.4)), rng.int(0, 1)],
      ["Email", Math.round(26 * weekend * rng.range(0.5, 1.5)), rng.int(0, 1)],
    ];
    let totalSessions = 0;
    let totalKeyEvents = 0;
    for (const [channel, sessions, keyEvents] of channels) {
      totalSessions += sessions;
      totalKeyEvents += keyEvents;
      ga4.push({
        date,
        dimension: "channel",
        value: channel,
        subValue: "",
        sessions,
        users: Math.round(sessions * 0.86),
        newUsers: Math.round(sessions * (channel === "Direct" ? 0.35 : 0.68)),
        engagedSessions: Math.round(sessions * (channel.startsWith("Paid") ? 0.46 : 0.58)),
        keyEvents,
      });
      if (keyEvents > 0) {
        const meetings = Math.round(keyEvents * 0.35);
        if (keyEvents - meetings > 0)
          ga4.push({
            date,
            dimension: "key_event",
            value: channel,
            subValue: "hubspot_form_submit",
            sessions: 0,
            users: 0,
            newUsers: 0,
            engagedSessions: 0,
            keyEvents: keyEvents - meetings,
          });
        if (meetings > 0)
          ga4.push({
            date,
            dimension: "key_event",
            value: channel,
            subValue: "hubspot_meeting_success",
            sessions: 0,
            users: 0,
            newUsers: 0,
            engagedSessions: 0,
            keyEvents: meetings,
          });
      }
    }
    for (const [page, share] of LANDING_PAGES) {
      const sessions = Math.round(totalSessions * share * rng.range(0.85, 1.15));
      ga4.push({
        date,
        dimension: "landing_page",
        value: page,
        subValue: "",
        sessions,
        users: Math.round(sessions * 0.88),
        newUsers: 0,
        engagedSessions: Math.round(sessions * (page === "/pricing" || page === "/demo" ? 0.66 : 0.52)),
        keyEvents: Math.round(totalKeyEvents * (page === "/demo" ? 0.4 : page === "/" ? 0.25 : page === "/pricing" ? 0.15 : 0.05)),
      });
    }

    // ── Search Console ──
    const siteImpr = Math.round(organicSessions * 38 * rng.range(0.9, 1.1));
    const siteClicks = Math.round(organicSessions * 0.97);
    searchConsole.push({
      date,
      dimension: "site",
      value: "",
      clicks: siteClicks,
      impressions: siteImpr,
      position: Math.round((9.5 - 2.2 * (i / Math.max(1, dates.length)) + rng.normal(0, 0.3)) * 10) / 10,
    });
    const qsum = SC_QUERIES.reduce((s, q) => s + q[1], 0);
    for (const [query, w, pos] of SC_QUERIES) {
      const impressions = Math.round(((siteImpr * 0.7 * w) / qsum) * rng.range(0.8, 1.2));
      const ctr = Math.max(0.005, 0.32 / Math.max(1, pos) + rng.normal(0, 0.01));
      searchConsole.push({
        date,
        dimension: "query",
        value: query,
        clicks: Math.round(impressions * ctr),
        impressions,
        position: Math.round((pos + rng.normal(0, 0.6)) * 10) / 10,
      });
    }
    for (const [page, share, pos] of SC_PAGES) {
      const impressions = Math.round(siteImpr * share * rng.range(0.85, 1.15));
      searchConsole.push({
        date,
        dimension: "page",
        value: page,
        clicks: Math.round(siteClicks * share * rng.range(0.85, 1.15)),
        impressions,
        position: Math.round((pos + rng.normal(0, 0.5)) * 10) / 10,
      });
    }

    // ── CRM funnel by original source ──
    const push = (source: string, stage: CrmFunnelDailyMetric["stage"], count: number, amount = 0) => {
      if (count > 0) crmFunnel.push({ date, source, stage, count, amount });
    };
    push("PAID_SEARCH", "lead", paid.leads.google);
    push("PAID_SEARCH", "mql", paid.mqls.google);
    push("PAID_SEARCH", "sql", paid.sqls.google);
    push("PAID_SEARCH", "opportunity", paid.opps.google, paid.pipeline.google);
    push("PAID_SEARCH", "closed_won", Math.round(paid.opps.google * 0.2), paid.revenue.google);
    push("PAID_SOCIAL", "lead", paid.leads.social);
    push("PAID_SOCIAL", "mql", paid.mqls.social);
    push("PAID_SOCIAL", "sql", paid.sqls.social);
    push("PAID_SOCIAL", "opportunity", paid.opps.social, paid.pipeline.social);
    push("PAID_SOCIAL", "closed_won", Math.round(paid.opps.social * 0.2), paid.revenue.social);
    const organicLeads = channels[2][2];
    const organicMql = rng.binomial(organicLeads, 0.55);
    const organicSql = rng.binomial(organicMql, 0.5);
    const organicOpp = rng.binomial(organicSql, 0.5);
    push("ORGANIC_SEARCH", "lead", organicLeads);
    push("ORGANIC_SEARCH", "mql", organicMql);
    push("ORGANIC_SEARCH", "sql", organicSql);
    push("ORGANIC_SEARCH", "opportunity", organicOpp, organicOpp * 24_000);
    push("ORGANIC_SEARCH", "closed_won", rng.binomial(organicOpp, 0.3), rng.binomial(organicOpp, 0.3) * 22_000);
    const directLeads = channels[3][2];
    push("DIRECT_TRAFFIC", "lead", directLeads);
    push("DIRECT_TRAFFIC", "mql", rng.binomial(directLeads, 0.5));
    push("DIRECT_TRAFFIC", "sql", rng.binomial(directLeads, 0.25));
    push("REFERRALS", "lead", channels[4][2]);
    push("REFERRALS", "mql", rng.binomial(channels[4][2], 0.6));
    push("EMAIL_MARKETING", "lead", channels[6][2]);
    push("OFFLINE", "lead", rng.int(0, 2));
    push("OFFLINE", "sql", rng.int(0, 1));
  }

  return { keywords, searchTerms, ga4, searchConsole, crmFunnel };
}

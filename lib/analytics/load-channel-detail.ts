import { cache } from "react";
import type { DataRepository } from "@/lib/data/repository";
import type { Campaign, DailyMetric, KeywordDailyMetric, Platform } from "@/types/domain";
import { previousWindow, windowEnding, type DateWindow } from "@/lib/utils/dates";
import { getRepository } from "@/lib/data";
import {
  adGroupTable,
  analyticsSignals,
  channelOverview,
  crmOverview,
  deriveAd,
  ga4Overview,
  googleAdsSignals,
  keywordTable,
  matchTypeBreakdown,
  searchConsoleOverview,
  searchTermTable,
  seoSignals,
  sortSignals,
  timeline,
  EMPTY_AD,
  type AdTotals,
  type Signal,
} from "./channel-detail";

export type ChannelDetail = Awaited<ReturnType<typeof loadChannelDetail>>;

/**
 * Load the channel-level rows for a window (plus the previous period) and
 * build every table the redesigned pages need. Independent of the campaign
 * snapshot so a missing source (e.g. Search Console) never blanks the page.
 */
export async function loadChannelDetail(repo: DataRepository, windowDays: number, endDate?: string) {
  const end = endDate ?? (await repo.getLatestDate());
  const window: DateWindow = windowEnding(end, windowDays);
  const previous = previousWindow(window);
  const range = { start: previous.start, end: window.end };
  const [campaigns, dailyMetrics, keywords, searchTerms, ga4Rows, scRows, crmRows, statuses] = await Promise.all([
    repo.getCampaigns(),
    repo.getDailyMetrics(range),
    repo.getKeywordDailyMetrics(range),
    repo.getSearchTermDailyMetrics(range),
    repo.getGa4Daily(range),
    repo.getSearchConsoleDaily(range),
    repo.getCrmFunnelDaily(range),
    repo.getIntegrationStatuses(),
  ]);
  const campaignsById = new Map(campaigns.map((c) => [c.id, c]));
  const connectedPlatforms = connectedFrom(
    statuses.map((s) => ({ key: s.key, health: s.health })),
    campaigns,
    dailyMetrics,
    window,
  );

  const keywordRows = keywordTable(keywords, window, previous);
  const searchTermRows = searchTermTable(searchTerms, window, previous);
  const account = googleAccountTotals(campaigns, dailyMetrics, window);
  const accountPrev = googleAccountTotals(campaigns, dailyMetrics, previous);
  const ga4 = ga4Overview(ga4Rows, window, previous);
  const sc = searchConsoleOverview(scRows, window, previous);
  const crm = crmOverview(crmRows, window, previous);
  const googleSignals = googleAdsSignals(keywordRows, searchTermRows, account, campaignsById);
  const signals = sortSignals([...googleSignals, ...analyticsSignals(ga4), ...seoSignals(sc)]);

  return {
    window,
    previous,
    endDate: end,
    campaigns,
    campaignsById,
    connectedPlatforms,
    integrations: statuses,
    googleAds: {
      account,
      accountPrev,
      derived: deriveAd(account),
      previousDerived: deriveAd(accountPrev),
      keywords: keywordRows,
      matchTypes: matchTypeBreakdown(keywordRows),
      adGroups: adGroupTable(keywordRows, adGroupStatuses(keywords)),
      searchTerms: searchTermRows,
      hasDetail: keywords.length > 0 || searchTerms.length > 0,
    },
    ga4,
    searchConsole: sc,
    crm,
    channels: channelOverview({ campaigns, dailyMetrics, ga4, crm, window, previous, connectedPlatforms }),
    timeline: timeline({ dailyMetrics, ga4: ga4Rows, searchConsole: scRows, window, previous }),
    signals,
    attention: signals.filter((s) => s.kind === "attention"),
    opportunities: signals.filter((s) => s.kind === "opportunity"),
  };
}

/** Google Ads account totals for the window (campaign-level, so it includes campaigns without keyword detail). */
function googleAccountTotals(campaigns: Campaign[], dailyMetrics: DailyMetric[], w: DateWindow): AdTotals {
  const google = new Set(campaigns.filter((c) => c.platform === "google").map((c) => c.id));
  const t: AdTotals = { ...EMPTY_AD };
  for (const m of dailyMetrics) {
    if (!google.has(m.campaignId) || m.date < w.start || m.date > w.end) continue;
    t.spend += m.spend;
    t.impressions += m.impressions;
    t.clicks += m.clicks;
    t.conversions += m.leads;
  }
  return t;
}

function adGroupStatuses(rows: KeywordDailyMetric[]) {
  const out = new Map<string, KeywordDailyMetric["adGroupStatus"]>();
  const seen = new Map<string, string>();
  for (const r of rows) {
    if ((seen.get(r.adGroupExternalId) ?? "") <= r.date) {
      seen.set(r.adGroupExternalId, r.date);
      out.set(r.adGroupExternalId, r.adGroupStatus);
    }
  }
  return out;
}

/** A platform counts as connected when its integration is healthy or it has spend in the window (demo mode). */
function connectedFrom(statuses: Array<{ key: string; health: string }>, campaigns: Campaign[], dailyMetrics: DailyMetric[], w: DateWindow): Set<Platform> {
  const out = new Set<Platform>();
  const ok = (k: string) => statuses.some((s) => s.key === k && (s.health === "connected" || s.health === "demo"));
  if (ok("notfair") || ok("google_ads")) out.add("google");
  if (ok("meta")) out.add("meta");
  if (ok("linkedin")) out.add("linkedin");
  const platformOf = new Map(campaigns.map((c) => [c.id, c.platform] as const));
  for (const m of dailyMetrics) {
    if (m.date < w.start || m.date > w.end || m.spend <= 0) continue;
    const p = platformOf.get(m.campaignId);
    if (p) out.add(p);
  }
  return out;
}

/** Per-request memoized detail so layout and page share one load. */
export const getPageChannelDetail = cache(async (days: number) => {
  const repo = await getRepository();
  return loadChannelDetail(repo, days);
});

export type { Signal };

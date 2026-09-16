/**
 * Channel-detail analytics for the redesigned dashboard.
 *
 * Everything here compares the selected window with the period immediately
 * before it (same length). Aggregations are total functions: rates are
 * `null` when the denominator is zero, never NaN.
 */

import type {
  Campaign,
  CrmFunnelDailyMetric,
  CrmStage,
  DailyMetric,
  Ga4DailyMetric,
  KeywordDailyMetric,
  KeywordMatchType,
  MetricTotals,
  Platform,
  SearchConsoleDailyMetric,
  SearchTermDailyMetric,
  SearchTermStatus,
} from "@/types/domain";
import type { DateWindow } from "@/lib/utils/dates";
import { dateRange } from "@/lib/utils/dates";
import { pctChange, safeDivide, sumTotals, EMPTY_TOTALS } from "@/lib/calculations/metrics";
import { crmSourceLabel, normalizeSource } from "@/integrations/crm-funnel";

export interface Compared<T> {
  current: T;
  previous: T;
}

const inWindow = (date: string, w: DateWindow) => date >= w.start && date <= w.end;

/** Group rows by key and reduce them for the current and previous windows. */
export function compareByKey<R extends { date: string }, T>(
  rows: R[],
  window: DateWindow,
  previous: DateWindow,
  keyOf: (r: R) => string,
  init: () => T,
  add: (acc: T, r: R) => void,
): Map<string, Compared<T>> {
  const out = new Map<string, Compared<T>>();
  for (const r of rows) {
    const cur = inWindow(r.date, window);
    const prev = !cur && inWindow(r.date, previous);
    if (!cur && !prev) continue;
    let entry = out.get(keyOf(r));
    if (!entry) {
      entry = { current: init(), previous: init() };
      out.set(keyOf(r), entry);
    }
    add(cur ? entry.current : entry.previous, r);
  }
  return out;
}

// ───────────────────────────── Google Ads ─────────────────────────────

export interface AdTotals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
}

export interface AdDerived {
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  conversionRate: number | null;
}

export const EMPTY_AD: AdTotals = { spend: 0, impressions: 0, clicks: 0, conversions: 0, conversionValue: 0 };

export function deriveAd(t: AdTotals): AdDerived {
  return {
    ctr: safeDivide(t.clicks, t.impressions),
    cpc: safeDivide(t.spend, t.clicks),
    cpa: safeDivide(t.spend, t.conversions),
    conversionRate: safeDivide(t.conversions, t.clicks),
  };
}

function addAd(acc: AdTotals, r: AdTotals) {
  acc.spend += r.spend;
  acc.impressions += r.impressions;
  acc.clicks += r.clicks;
  acc.conversions += r.conversions;
  acc.conversionValue += r.conversionValue;
}

export interface KeywordRow {
  key: string;
  campaignId: string;
  adGroupExternalId: string;
  adGroupName: string;
  keywordText: string;
  matchType: KeywordMatchType;
  status: KeywordDailyMetric["status"];
  /** Most recent quality score in the window (1–10) when Google reports one. */
  qualityScore?: number;
  /** Impression-weighted over the window. */
  topImpressionPct: number | null;
  searchImpressionShare: number | null;
  current: AdTotals;
  previous: AdTotals;
  derived: AdDerived;
  previousDerived: AdDerived;
}

interface KeywordAcc extends AdTotals {
  qsDate: string;
  qualityScore?: number;
  topWeighted: number;
  shareWeighted: number;
  weightedImpressions: number;
}

export function keywordTable(rows: KeywordDailyMetric[], window: DateWindow, previous: DateWindow): KeywordRow[] {
  const meta = new Map<string, KeywordDailyMetric>();
  const grouped = compareByKey(
    rows,
    window,
    previous,
    (r) => `${r.adGroupExternalId}:${r.externalId}`,
    (): KeywordAcc => ({ ...EMPTY_AD, qsDate: "", topWeighted: 0, shareWeighted: 0, weightedImpressions: 0 }),
    (acc, r) => {
      addAd(acc, r);
      if (r.qualityScore !== undefined && r.date >= acc.qsDate) {
        acc.qsDate = r.date;
        acc.qualityScore = r.qualityScore;
      }
      if (r.impressions > 0) {
        if (r.topImpressionPct !== undefined) acc.topWeighted += r.topImpressionPct * r.impressions;
        if (r.searchImpressionShare !== undefined) acc.shareWeighted += r.searchImpressionShare * r.impressions;
        acc.weightedImpressions += r.impressions;
      }
    },
  );
  for (const r of rows) {
    const key = `${r.adGroupExternalId}:${r.externalId}`;
    const existing = meta.get(key);
    if (!existing || r.date > existing.date) meta.set(key, r);
  }
  const out: KeywordRow[] = [];
  for (const [key, { current, previous: prev }] of grouped) {
    const m = meta.get(key)!;
    out.push({
      key,
      campaignId: m.campaignId,
      adGroupExternalId: m.adGroupExternalId,
      adGroupName: m.adGroupName,
      keywordText: m.keywordText,
      matchType: m.matchType,
      status: m.status,
      qualityScore: current.qualityScore ?? prev.qualityScore,
      topImpressionPct: current.weightedImpressions ? current.topWeighted / current.weightedImpressions : null,
      searchImpressionShare: current.weightedImpressions ? current.shareWeighted / current.weightedImpressions : null,
      current: pickAd(current),
      previous: pickAd(prev),
      derived: deriveAd(current),
      previousDerived: deriveAd(prev),
    });
  }
  return out.sort((a, b) => b.current.spend - a.current.spend || b.current.clicks - a.current.clicks || a.keywordText.localeCompare(b.keywordText));
}

function pickAd(t: AdTotals): AdTotals {
  return { spend: round2(t.spend), impressions: t.impressions, clicks: t.clicks, conversions: t.conversions, conversionValue: round2(t.conversionValue) };
}

export interface MatchTypeRow {
  matchType: KeywordMatchType;
  current: AdTotals;
  previous: AdTotals;
  derived: AdDerived;
  previousDerived: AdDerived;
  keywords: number;
}

export function matchTypeBreakdown(rows: KeywordRow[]): MatchTypeRow[] {
  const order: KeywordMatchType[] = ["EXACT", "PHRASE", "BROAD", "UNSPECIFIED"];
  const by = new Map<KeywordMatchType, MatchTypeRow>();
  for (const r of rows) {
    const entry = by.get(r.matchType) ?? {
      matchType: r.matchType,
      current: { ...EMPTY_AD },
      previous: { ...EMPTY_AD },
      derived: deriveAd(EMPTY_AD),
      previousDerived: deriveAd(EMPTY_AD),
      keywords: 0,
    };
    addAd(entry.current, r.current);
    addAd(entry.previous, r.previous);
    entry.keywords += 1;
    by.set(r.matchType, entry);
  }
  return order
    .filter((m) => by.has(m))
    .map((m) => {
      const e = by.get(m)!;
      return { ...e, current: pickAd(e.current), previous: pickAd(e.previous), derived: deriveAd(e.current), previousDerived: deriveAd(e.previous) };
    });
}

export interface SearchTermRow {
  key: string;
  campaignId: string;
  adGroupExternalId: string;
  adGroupName: string;
  searchTerm: string;
  status: SearchTermStatus;
  keywordText: string;
  matchType: KeywordMatchType;
  current: AdTotals;
  previous: AdTotals;
  derived: AdDerived;
}

export function searchTermTable(rows: SearchTermDailyMetric[], window: DateWindow, previous: DateWindow): SearchTermRow[] {
  const meta = new Map<string, SearchTermDailyMetric>();
  const keyOf = (r: SearchTermDailyMetric) => `${r.adGroupExternalId}|${r.searchTerm}|${r.keywordText}|${r.matchType}`;
  const grouped = compareByKey(rows, window, previous, keyOf, (): AdTotals => ({ ...EMPTY_AD }), addAd);
  for (const r of rows) {
    const key = keyOf(r);
    const existing = meta.get(key);
    if (!existing || r.date > existing.date) meta.set(key, r);
  }
  const out: SearchTermRow[] = [];
  for (const [key, { current, previous: prev }] of grouped) {
    const m = meta.get(key)!;
    out.push({
      key,
      campaignId: m.campaignId,
      adGroupExternalId: m.adGroupExternalId,
      adGroupName: m.adGroupName,
      searchTerm: m.searchTerm,
      status: m.status,
      keywordText: m.keywordText,
      matchType: m.matchType,
      current: pickAd(current),
      previous: pickAd(prev),
      derived: deriveAd(current),
    });
  }
  return out.sort((a, b) => b.current.spend - a.current.spend || b.current.impressions - a.current.impressions || a.searchTerm.localeCompare(b.searchTerm));
}

export interface AdGroupRow {
  key: string;
  campaignId: string;
  adGroupExternalId: string;
  adGroupName: string;
  status: KeywordDailyMetric["adGroupStatus"];
  keywords: number;
  current: AdTotals;
  previous: AdTotals;
  derived: AdDerived;
}

export function adGroupTable(rows: KeywordRow[], statusOf: Map<string, KeywordDailyMetric["adGroupStatus"]>): AdGroupRow[] {
  const by = new Map<string, AdGroupRow>();
  for (const r of rows) {
    const key = `${r.campaignId}:${r.adGroupExternalId}`;
    const e = by.get(key) ?? {
      key,
      campaignId: r.campaignId,
      adGroupExternalId: r.adGroupExternalId,
      adGroupName: r.adGroupName,
      status: statusOf.get(r.adGroupExternalId) ?? "active",
      keywords: 0,
      current: { ...EMPTY_AD },
      previous: { ...EMPTY_AD },
      derived: deriveAd(EMPTY_AD),
    };
    addAd(e.current, r.current);
    addAd(e.previous, r.previous);
    e.keywords += 1;
    by.set(key, e);
  }
  return [...by.values()].map((e) => ({ ...e, derived: deriveAd(e.current) })).sort((a, b) => b.current.spend - a.current.spend);
}

// ───────────────────────────── Alerts + opportunities ─────────────────────────────

export type SignalSeverity = "critical" | "warning" | "info";
export type SignalKind = "attention" | "opportunity";

export interface Signal {
  id: string;
  kind: SignalKind;
  severity: SignalSeverity;
  area: "google_ads" | "meta_ads" | "analytics" | "seo" | "crm";
  title: string;
  detail: string;
  /** Link into the section page. */
  href?: string;
  campaignId?: string;
  /** A concrete next step. */
  action?: string;
  /** Money involved, for sorting. */
  amount?: number;
}

export interface GoogleAdsRuleOptions {
  /** Spend with zero conversions that is worth calling out (default $150 or 5% of window spend, whichever is larger). */
  wastedSpendFloor?: number;
  /** Multiple of the account CPA above which a keyword is flagged (default 2×). */
  cpaMultiple?: number;
}

/** Rule-based Google Ads signals at keyword / search-term level. */
export function googleAdsSignals(
  keywords: KeywordRow[],
  searchTerms: SearchTermRow[],
  account: AdTotals,
  campaignsById: Map<string, Campaign>,
  opts: GoogleAdsRuleOptions = {},
): Signal[] {
  const out: Signal[] = [];
  const acct = deriveAd(account);
  const floor = opts.wastedSpendFloor ?? Math.max(150, account.spend * 0.05);
  const cpaMultiple = opts.cpaMultiple ?? 2;
  const campaignName = (id: string) => campaignsById.get(id)?.name ?? "campaign";

  for (const k of keywords) {
    if (k.status !== "active") continue;
    const c = k.current;
    if (c.spend >= floor && c.conversions === 0) {
      out.push({
        id: `kw-waste:${k.key}`,
        kind: "attention",
        severity: c.spend >= floor * 3 ? "critical" : "warning",
        area: "google_ads",
        title: `"${k.keywordText}" spent $${c.spend.toFixed(0)} with no conversions`,
        detail: `${k.matchType.toLowerCase()} match in ${k.adGroupName} (${campaignName(k.campaignId)}) · ${c.clicks} clicks`,
        campaignId: k.campaignId,
        action: "Review search terms, tighten match type or pause the keyword.",
        amount: c.spend,
      });
      continue;
    }
    if (acct.cpa !== null && k.derived.cpa !== null && c.conversions >= 1 && c.spend >= floor && k.derived.cpa > acct.cpa * cpaMultiple) {
      out.push({
        id: `kw-cpa:${k.key}`,
        kind: "attention",
        severity: "warning",
        area: "google_ads",
        title: `"${k.keywordText}" costs $${k.derived.cpa.toFixed(0)} per conversion (account $${acct.cpa.toFixed(0)})`,
        detail: `${k.matchType.toLowerCase()} match in ${k.adGroupName} · $${c.spend.toFixed(0)} spend, ${c.conversions} conversions`,
        campaignId: k.campaignId,
        action: "Lower the bid or move budget to better-converting keywords.",
        amount: c.spend,
      });
    }
    if (k.qualityScore !== undefined && k.qualityScore <= 3 && c.spend >= floor / 3) {
      out.push({
        id: `kw-qs:${k.key}`,
        kind: "attention",
        severity: "warning",
        area: "google_ads",
        title: `Quality Score ${k.qualityScore}/10 on "${k.keywordText}"`,
        detail: `${k.adGroupName} · $${c.spend.toFixed(0)} spend — low relevance raises CPC`,
        campaignId: k.campaignId,
        action: "Improve ad relevance and landing page experience for this ad group.",
        amount: c.spend,
      });
    }
    if (acct.ctr !== null && k.derived.ctr !== null && c.impressions >= 200 && k.derived.ctr < acct.ctr * 0.5) {
      out.push({
        id: `kw-ctr:${k.key}`,
        kind: "attention",
        severity: "info",
        area: "google_ads",
        title: `Low CTR on "${k.keywordText}" (${(k.derived.ctr * 100).toFixed(1)}% vs ${(acct.ctr * 100).toFixed(1)}% account)`,
        detail: `${c.impressions.toLocaleString()} impressions in ${k.adGroupName}`,
        campaignId: k.campaignId,
        action: "Test tighter match type or new ad copy.",
        amount: c.spend,
      });
    }
    if (
      k.previous.conversions > 0 &&
      c.conversions > 0 &&
      k.searchImpressionShare !== null &&
      k.searchImpressionShare < 0.4 &&
      k.derived.cpa !== null &&
      acct.cpa !== null &&
      k.derived.cpa <= acct.cpa * 0.8
    ) {
      out.push({
        id: `kw-scale:${k.key}`,
        kind: "opportunity",
        severity: "info",
        area: "google_ads",
        title: `"${k.keywordText}" converts below account CPA with only ${(k.searchImpressionShare * 100).toFixed(0)}% impression share`,
        detail: `$${k.derived.cpa.toFixed(0)} per conversion vs $${acct.cpa.toFixed(0)} account · ${c.conversions} conversions`,
        campaignId: k.campaignId,
        action: "Raise the bid or budget to capture more of this demand.",
        amount: c.spend,
      });
    }
  }

  for (const t of searchTerms) {
    const c = t.current;
    if (t.status !== "EXCLUDED" && t.status !== "ADDED_EXCLUDED" && c.spend >= floor / 2 && c.conversions === 0 && c.clicks >= 5) {
      out.push({
        id: `st-negative:${t.key}`,
        kind: "opportunity",
        severity: c.spend >= floor ? "warning" : "info",
        area: "google_ads",
        title: `Add negative: "${t.searchTerm}"`,
        detail: `$${c.spend.toFixed(0)} on ${c.clicks} clicks, no conversions · matched "${t.keywordText}" (${t.matchType.toLowerCase()}) in ${t.adGroupName}`,
        campaignId: t.campaignId,
        action: "Add as a negative keyword.",
        amount: c.spend,
      });
    }
    if (t.status === "NONE" && c.conversions >= 2) {
      out.push({
        id: `st-add:${t.key}`,
        kind: "opportunity",
        severity: "info",
        area: "google_ads",
        title: `Add keyword: "${t.searchTerm}"`,
        detail: `${c.conversions} conversions from ${c.clicks} clicks ($${c.spend.toFixed(0)}) without a dedicated keyword`,
        campaignId: t.campaignId,
        action: "Add as an exact-match keyword to control bids and copy.",
        amount: c.spend,
      });
    }
  }
  return dedupeSignals(out);
}

function dedupeSignals(list: Signal[]) {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

const SEVERITY_RANK: Record<SignalSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function sortSignals(list: Signal[]): Signal[] {
  return [...list].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (b.amount ?? 0) - (a.amount ?? 0));
}

// ───────────────────────────── GA4 ─────────────────────────────

export interface Ga4Totals {
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
  keyEvents: number;
}

export const EMPTY_GA4: Ga4Totals = { sessions: 0, users: 0, newUsers: 0, engagedSessions: 0, keyEvents: 0 };

export function engagementRate(t: Ga4Totals) {
  return safeDivide(t.engagedSessions, t.sessions);
}

export function keyEventRate(t: Ga4Totals) {
  return safeDivide(t.keyEvents, t.sessions);
}

function addGa4(acc: Ga4Totals, r: Ga4Totals) {
  acc.sessions += r.sessions;
  acc.users += r.users;
  acc.newUsers += r.newUsers;
  acc.engagedSessions += r.engagedSessions;
  acc.keyEvents += r.keyEvents;
}

export interface Ga4Overview {
  available: boolean;
  totals: Compared<Ga4Totals>;
  channels: Array<{ channel: string } & Compared<Ga4Totals>>;
  landingPages: Array<{ page: string } & Compared<Ga4Totals>>;
  keyEvents: Array<{ event: string } & Compared<{ count: number }>>;
  keyEventsByChannel: Array<{ channel: string; event: string; count: number }>;
}

export function ga4Overview(rows: Ga4DailyMetric[], window: DateWindow, previous: DateWindow): Ga4Overview {
  const channelRows = rows.filter((r) => r.dimension === "channel");
  const channels = compareByKey(
    channelRows,
    window,
    previous,
    (r) => r.value,
    (): Ga4Totals => ({ ...EMPTY_GA4 }),
    addGa4,
  );
  const totals: Compared<Ga4Totals> = { current: { ...EMPTY_GA4 }, previous: { ...EMPTY_GA4 } };
  for (const c of channels.values()) {
    addGa4(totals.current, c.current);
    addGa4(totals.previous, c.previous);
  }
  const landing = compareByKey(
    rows.filter((r) => r.dimension === "landing_page"),
    window,
    previous,
    (r) => r.value,
    (): Ga4Totals => ({ ...EMPTY_GA4 }),
    addGa4,
  );
  const keyEventRows = rows.filter((r) => r.dimension === "key_event");
  const events = compareByKey(
    keyEventRows,
    window,
    previous,
    (r) => r.subValue,
    () => ({ count: 0 }),
    (acc, r) => void (acc.count += r.keyEvents),
  );
  const byChannel = new Map<string, number>();
  for (const r of keyEventRows)
    if (inWindow(r.date, window)) byChannel.set(`${r.value}|${r.subValue}`, (byChannel.get(`${r.value}|${r.subValue}`) ?? 0) + r.keyEvents);
  return {
    available: channelRows.length > 0,
    totals,
    channels: [...channels.entries()].map(([channel, c]) => ({ channel, ...c })).sort((a, b) => b.current.sessions - a.current.sessions),
    landingPages: [...landing.entries()].map(([page, c]) => ({ page, ...c })).sort((a, b) => b.current.sessions - a.current.sessions),
    keyEvents: [...events.entries()].map(([event, c]) => ({ event, ...c })).sort((a, b) => b.current.count - a.current.count),
    keyEventsByChannel: [...byChannel.entries()]
      .map(([k, count]) => ({ channel: k.split("|")[0], event: k.split("|")[1], count }))
      .sort((a, b) => b.count - a.count),
  };
}

export function analyticsSignals(ga4: Ga4Overview): Signal[] {
  const out: Signal[] = [];
  if (!ga4.available) return out;
  const siteRate = engagementRate(ga4.totals.current);
  for (const p of ga4.landingPages.slice(0, 15)) {
    const rate = engagementRate(p.current);
    if (siteRate !== null && rate !== null && p.current.sessions >= 100 && rate < siteRate * 0.6) {
      out.push({
        id: `ga4-engagement:${p.page}`,
        kind: "attention",
        severity: "warning",
        area: "analytics",
        title: `Landing page ${p.page} engages ${(rate * 100).toFixed(0)}% of visitors (site ${(siteRate * 100).toFixed(0)}%)`,
        detail: `${p.current.sessions.toLocaleString()} sessions · ${p.current.keyEvents} key events`,
        action: "Check page speed, message match and the primary call to action.",
      });
    }
    const kev = keyEventRate(p.current);
    const siteKev = keyEventRate(ga4.totals.current);
    if (siteKev !== null && kev !== null && p.current.sessions >= 100 && kev > siteKev * 2 && p.current.keyEvents >= 3) {
      out.push({
        id: `ga4-converter:${p.page}`,
        kind: "opportunity",
        severity: "info",
        area: "analytics",
        title: `${p.page} converts at ${(kev * 100).toFixed(1)}% (site ${(siteKev * 100).toFixed(1)}%)`,
        detail: `${p.current.sessions.toLocaleString()} sessions → ${p.current.keyEvents} key events`,
        action: "Send more paid and organic traffic here; reuse its message in ads.",
      });
    }
  }
  for (const c of ga4.channels) {
    const change = pctChange(c.current.sessions, c.previous.sessions);
    if (change !== null && c.previous.sessions >= 100 && change <= -0.3) {
      out.push({
        id: `ga4-drop:${c.channel}`,
        kind: "attention",
        severity: "warning",
        area: "analytics",
        title: `${c.channel} sessions down ${Math.abs(change * 100).toFixed(0)}% vs prior period`,
        detail: `${c.previous.sessions.toLocaleString()} → ${c.current.sessions.toLocaleString()} sessions`,
        action: c.channel.startsWith("Paid") ? "Check budgets, pauses and disapprovals." : "Check tracking, rankings and referring sites.",
      });
    }
  }
  return out;
}

// ───────────────────────────── Search Console ─────────────────────────────

export interface ScTotals {
  clicks: number;
  impressions: number;
  /** Impression-weighted average position. */
  position: number | null;
  ctr: number | null;
}

interface ScAcc {
  clicks: number;
  impressions: number;
  posWeighted: number;
  posImpressions: number;
}

function scInit(): ScAcc {
  return { clicks: 0, impressions: 0, posWeighted: 0, posImpressions: 0 };
}

function scAdd(acc: ScAcc, r: SearchConsoleDailyMetric) {
  acc.clicks += r.clicks;
  acc.impressions += r.impressions;
  if (r.position !== undefined && r.impressions > 0) {
    acc.posWeighted += r.position * r.impressions;
    acc.posImpressions += r.impressions;
  }
}

function scFinish(a: ScAcc): ScTotals {
  return {
    clicks: a.clicks,
    impressions: a.impressions,
    position: a.posImpressions ? Math.round((a.posWeighted / a.posImpressions) * 10) / 10 : null,
    ctr: safeDivide(a.clicks, a.impressions),
  };
}

export interface SearchConsoleOverview {
  available: boolean;
  site: Compared<ScTotals>;
  queries: Array<{ query: string } & Compared<ScTotals>>;
  pages: Array<{ page: string } & Compared<ScTotals>>;
}

export function searchConsoleOverview(rows: SearchConsoleDailyMetric[], window: DateWindow, previous: DateWindow): SearchConsoleOverview {
  const finish = <K extends string>(m: Map<string, Compared<ScAcc>>, key: K) =>
    [...m.entries()]
      .map(
        ([value, c]) =>
          ({ [key]: value, current: scFinish(c.current), previous: scFinish(c.previous) }) as unknown as { [P in K]: string } & Compared<ScTotals>,
      )
      .sort((a, b) => b.current.clicks - a.current.clicks || b.current.impressions - a.current.impressions);
  const site = compareByKey(
    rows.filter((r) => r.dimension === "site"),
    window,
    previous,
    () => "site",
    scInit,
    scAdd,
  ).get("site") ?? { current: scInit(), previous: scInit() };
  return {
    available: rows.some((r) => r.dimension === "site" && r.impressions > 0),
    site: { current: scFinish(site.current), previous: scFinish(site.previous) },
    queries: finish(
      compareByKey(
        rows.filter((r) => r.dimension === "query"),
        window,
        previous,
        (r) => r.value,
        scInit,
        scAdd,
      ),
      "query",
    ),
    pages: finish(
      compareByKey(
        rows.filter((r) => r.dimension === "page"),
        window,
        previous,
        (r) => r.value,
        scInit,
        scAdd,
      ),
      "page",
    ),
  };
}

export function seoSignals(sc: SearchConsoleOverview): Signal[] {
  const out: Signal[] = [];
  if (!sc.available) return out;
  for (const q of sc.queries) {
    const c = q.current;
    if (c.position !== null && c.position >= 4 && c.position <= 15 && c.impressions >= 200) {
      out.push({
        id: `seo-striking:${q.query}`,
        kind: "opportunity",
        severity: c.position <= 8 ? "warning" : "info",
        area: "seo",
        title: `"${q.query}" ranks #${c.position.toFixed(0)} with ${c.impressions.toLocaleString()} impressions`,
        detail: `${c.clicks} clicks · ${c.ctr === null ? "—" : `${(c.ctr * 100).toFixed(1)}%`} CTR — page 1 top-3 would multiply clicks`,
        action: "Strengthen the ranking page: content depth, internal links, title tag.",
        amount: c.impressions,
      });
    }
    if (c.position !== null && c.position <= 3 && c.impressions >= 300 && c.ctr !== null && c.ctr < 0.03) {
      out.push({
        id: `seo-ctr:${q.query}`,
        kind: "opportunity",
        severity: "info",
        area: "seo",
        title: `"${q.query}" ranks #${c.position.toFixed(0)} but only ${(c.ctr * 100).toFixed(1)}% click`,
        detail: `${c.impressions.toLocaleString()} impressions`,
        action: "Rewrite the title and meta description for this query.",
        amount: c.impressions,
      });
    }
    const drop = q.previous.clicks >= 20 ? pctChange(c.clicks, q.previous.clicks) : null;
    if (drop !== null && drop <= -0.4) {
      out.push({
        id: `seo-drop:${q.query}`,
        kind: "attention",
        severity: "warning",
        area: "seo",
        title: `Organic clicks for "${q.query}" down ${Math.abs(drop * 100).toFixed(0)}%`,
        detail: `${q.previous.clicks} → ${c.clicks} clicks · position ${q.previous.position ?? "—"} → ${c.position ?? "—"}`,
        action: "Check for ranking loss, a competing page, or a SERP feature change.",
        amount: q.previous.clicks,
      });
    }
  }
  return out;
}

// ───────────────────────────── CRM by source ─────────────────────────────

export type StageCounts = Record<CrmStage, number> & { pipeline: number; revenue: number };

export const EMPTY_STAGES: StageCounts = { lead: 0, mql: 0, sql: 0, opportunity: 0, closed_won: 0, closed_lost: 0, pipeline: 0, revenue: 0 };

function addStage(acc: StageCounts, r: CrmFunnelDailyMetric) {
  acc[r.stage] += r.count;
  if (r.stage === "opportunity") acc.pipeline += r.amount;
  if (r.stage === "closed_won") acc.revenue += r.amount;
}

export interface CrmSourceRow {
  source: string;
  label: string;
  current: StageCounts;
  previous: StageCounts;
}

export interface CrmOverview {
  available: boolean;
  totals: Compared<StageCounts>;
  bySource: CrmSourceRow[];
}

export function crmOverview(rows: CrmFunnelDailyMetric[], window: DateWindow, previous: DateWindow): CrmOverview {
  const grouped = compareByKey(
    rows,
    window,
    previous,
    (r) => normalizeSource(r.source),
    (): StageCounts => ({ ...EMPTY_STAGES }),
    addStage,
  );
  const totals: Compared<StageCounts> = { current: { ...EMPTY_STAGES }, previous: { ...EMPTY_STAGES } };
  const bySource: CrmSourceRow[] = [];
  for (const [source, c] of grouped) {
    for (const k of Object.keys(EMPTY_STAGES) as Array<keyof StageCounts>) {
      totals.current[k] += c.current[k];
      totals.previous[k] += c.previous[k];
    }
    bySource.push({ source, label: crmSourceLabel(source), current: c.current, previous: c.previous });
  }
  bySource.sort((a, b) => b.current.sql - a.current.sql || b.current.mql - a.current.mql || b.current.lead - a.current.lead);
  return { available: rows.length > 0, totals, bySource };
}

// ───────────────────────────── Channel overview ─────────────────────────────

export type ChannelKey = "google_ads" | "meta_ads" | "linkedin_ads" | "organic_search" | "direct" | "referral" | "organic_social" | "email" | "other";

export interface ChannelTotals extends MetricTotals {
  sessions: number | null;
  keyEvents: number | null;
}

export interface ChannelRow {
  key: ChannelKey;
  label: string;
  kind: "paid" | "organic";
  /** Ad platform behind a paid channel. */
  platform?: Platform;
  /** false when nothing feeds this channel yet (e.g. Meta not connected). */
  connected: boolean;
  current: ChannelTotals;
  previous: ChannelTotals;
}

const CHANNELS: Array<{ key: ChannelKey; label: string; kind: "paid" | "organic"; platform?: Platform; ga4: string[]; crm: string[] }> = [
  { key: "google_ads", label: "Google Ads", kind: "paid", platform: "google", ga4: ["Paid Search"], crm: ["PAID_SEARCH"] },
  { key: "meta_ads", label: "Meta Ads", kind: "paid", platform: "meta", ga4: [], crm: [] },
  { key: "linkedin_ads", label: "LinkedIn Ads", kind: "paid", platform: "linkedin", ga4: [], crm: [] },
  { key: "organic_search", label: "Organic Search", kind: "organic", ga4: ["Organic Search"], crm: ["ORGANIC_SEARCH"] },
  { key: "direct", label: "Direct", kind: "organic", ga4: ["Direct"], crm: ["DIRECT_TRAFFIC"] },
  { key: "referral", label: "Referral", kind: "organic", ga4: ["Referral"], crm: ["REFERRALS"] },
  { key: "organic_social", label: "Organic Social", kind: "organic", ga4: ["Organic Social"], crm: ["SOCIAL_MEDIA", "ORGANIC_SOCIAL"] },
  { key: "email", label: "Email", kind: "organic", ga4: ["Email"], crm: ["EMAIL_MARKETING"] },
  { key: "other", label: "Other", kind: "organic", ga4: [], crm: [] },
];

export interface ChannelOverviewInput {
  campaigns: Campaign[];
  dailyMetrics: DailyMetric[];
  ga4: Ga4Overview;
  crm: CrmOverview;
  window: DateWindow;
  previous: DateWindow;
  connectedPlatforms: Set<Platform>;
}

/**
 * One row per channel. Paid rows come from the ad platforms (spend, clicks,
 * platform conversions as leads) with CRM stages attributed to their
 * campaigns; organic rows take sessions/key events from GA4 and funnel
 * stages from the CRM by original source. Paid Social sessions cannot be
 * split between Meta and LinkedIn by GA4, so they are shown only when a
 * single social platform is connected.
 */
export function channelOverview(input: ChannelOverviewInput): ChannelRow[] {
  const platformOf = new Map(input.campaigns.map((c) => [c.id, c.platform] as const));
  const paid = (w: DateWindow): Map<Platform, MetricTotals> => {
    const buckets = new Map<Platform, DailyMetric[]>();
    for (const m of input.dailyMetrics) {
      if (!inWindow(m.date, w)) continue;
      const p = platformOf.get(m.campaignId);
      if (!p) continue;
      buckets.set(p, [...(buckets.get(p) ?? []), m]);
    }
    return new Map((["google", "meta", "linkedin"] as Platform[]).map((p) => [p, sumTotals(buckets.get(p) ?? [])]));
  };
  const paidCur = paid(input.window);
  const paidPrev = paid(input.previous);
  const ga4Of = (names: string[], side: "current" | "previous") => {
    const rows = input.ga4.channels.filter((c) => names.includes(c.channel));
    if (!rows.length) return null;
    const t = { ...EMPTY_GA4 };
    for (const r of rows) addGa4(t, r[side]);
    return t;
  };
  const crmOf = (sources: string[], side: "current" | "previous") => {
    const t = { ...EMPTY_STAGES };
    for (const r of input.crm.bySource)
      if (sources.includes(r.source)) for (const k of Object.keys(EMPTY_STAGES) as Array<keyof StageCounts>) t[k] += r[side][k];
    return t;
  };
  const socialPlatforms = (["meta", "linkedin"] as Platform[]).filter((p) => input.connectedPlatforms.has(p));
  const knownGa4 = new Set(CHANNELS.flatMap((c) => c.ga4).concat(["Paid Social", "Cross-network", "Paid Other", "Paid Video", "Paid Shopping", "Display"]));
  const knownCrm = new Set(CHANNELS.flatMap((c) => c.crm).concat(["PAID_SOCIAL"]));

  return CHANNELS.map((def) => {
    const build = (side: "current" | "previous"): ChannelTotals => {
      if (def.kind === "paid" && def.platform) {
        const t = (side === "current" ? paidCur : paidPrev).get(def.platform) ?? { ...EMPTY_TOTALS };
        let ga4: Ga4Totals | null = ga4Of(def.ga4, side);
        if (def.platform !== "google" && socialPlatforms.length === 1 && socialPlatforms[0] === def.platform) ga4 = ga4Of(["Paid Social"], side);
        return { ...t, sessions: ga4 ? ga4.sessions : null, keyEvents: ga4 ? ga4.keyEvents : null };
      }
      let ga4: Ga4Totals | null;
      let crm: StageCounts;
      if (def.key === "other") {
        const rows = input.ga4.channels.filter((c) => !knownGa4.has(c.channel));
        ga4 = rows.length ? rows.reduce((acc, r) => (addGa4(acc, r[side]), acc), { ...EMPTY_GA4 }) : null;
        crm = { ...EMPTY_STAGES };
        for (const r of input.crm.bySource)
          if (!knownCrm.has(r.source)) for (const k of Object.keys(EMPTY_STAGES) as Array<keyof StageCounts>) crm[k] += r[side][k];
      } else {
        ga4 = ga4Of(def.ga4, side);
        crm = crmOf(def.crm, side);
      }
      return {
        spend: 0,
        impressions: 0,
        clicks: 0,
        leads: crm.lead,
        mqls: crm.mql,
        sqls: crm.sql,
        opportunities: crm.opportunity,
        pipeline: crm.pipeline,
        revenue: crm.revenue,
        sessions: ga4 ? ga4.sessions : null,
        keyEvents: ga4 ? ga4.keyEvents : null,
      };
    };
    const current = build("current");
    const previous = build("previous");
    const connected =
      def.kind === "paid" && def.platform
        ? input.connectedPlatforms.has(def.platform) || current.spend > 0 || previous.spend > 0
        : current.sessions !== null || previous.sessions !== null || current.leads + previous.leads > 0;
    return { key: def.key, label: def.label, kind: def.kind, platform: def.platform, connected, current, previous };
  });
}

// ───────────────────────────── Timeline ─────────────────────────────

export type TimelineMetric = "spend" | "clicks" | "leads" | "mqls" | "sqls" | "pipeline" | "sessions" | "keyEvents" | "organicClicks";

export const TIMELINE_METRICS: Array<{ key: TimelineMetric; label: string; format: "currency" | "number" }> = [
  { key: "spend", label: "Ad spend", format: "currency" },
  { key: "clicks", label: "Paid clicks", format: "number" },
  { key: "sessions", label: "Sessions (GA4)", format: "number" },
  { key: "keyEvents", label: "Key events (GA4)", format: "number" },
  { key: "leads", label: "Leads", format: "number" },
  { key: "mqls", label: "MQLs", format: "number" },
  { key: "sqls", label: "SQLs", format: "number" },
  { key: "pipeline", label: "Pipeline", format: "currency" },
  { key: "organicClicks", label: "Organic clicks (Search Console)", format: "number" },
];

export interface TimelinePoint extends Record<TimelineMetric, number> {
  date: string;
  /** Same day-offset in the previous period. */
  previousDate: string;
  previous: Record<TimelineMetric, number>;
}

export function timeline(input: {
  dailyMetrics: DailyMetric[];
  ga4: Ga4DailyMetric[];
  searchConsole: SearchConsoleDailyMetric[];
  window: DateWindow;
  previous: DateWindow;
}): TimelinePoint[] {
  const empty = (): Record<TimelineMetric, number> => ({
    spend: 0,
    clicks: 0,
    leads: 0,
    mqls: 0,
    sqls: 0,
    pipeline: 0,
    sessions: 0,
    keyEvents: 0,
    organicClicks: 0,
  });
  const byDate = new Map<string, Record<TimelineMetric, number>>();
  const at = (d: string) => {
    let r = byDate.get(d);
    if (!r) byDate.set(d, (r = empty()));
    return r;
  };
  for (const m of input.dailyMetrics) {
    const r = at(m.date);
    r.spend += m.spend;
    r.clicks += m.clicks;
    r.leads += m.leads;
    r.mqls += m.mqls;
    r.sqls += m.sqls;
    r.pipeline += m.pipeline;
  }
  for (const g of input.ga4) {
    if (g.dimension !== "channel") continue;
    const r = at(g.date);
    r.sessions += g.sessions;
    r.keyEvents += g.keyEvents;
  }
  for (const s of input.searchConsole) if (s.dimension === "site") at(s.date).organicClicks += s.clicks;
  const cur = dateRange(input.window.start, input.window.end);
  const prev = dateRange(input.previous.start, input.previous.end);
  return cur.map((date, i) => ({ date, previousDate: prev[i] ?? "", ...(byDate.get(date) ?? empty()), previous: byDate.get(prev[i] ?? "") ?? empty() }));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

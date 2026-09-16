/**
 * Weekly Ad Performance Report — data model.
 *
 * Pure functions over the stored campaign-day and ad-day rows. Every rate is
 * derived from summed totals (never averaged from campaign-level rates):
 *   CTR = clicks / impressions · CPC = spend / clicks · CPM = spend / impressions × 1000
 *   Cost per conversion = spend / conversions
 * "Conversions" are the ad platform's primary conversions (stored as
 * `leads` on the daily rows). Reach and frequency exist only where the
 * platform reports frequency (Meta, LinkedIn); Google Search has neither.
 */

import type { Campaign, Creative, CreativeDailyMetric, DailyMetric, IntegrationStatus, Platform } from "@/types/domain";
import type { DateWindow } from "@/lib/utils/dates";
import { dateRange } from "@/lib/utils/dates";
import { pctChange, safeDivide } from "@/lib/calculations/metrics";
import { PLATFORM_LABEL } from "@/lib/utils/format";

export interface AdTotals {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Sum of daily reach where the platform reports frequency; null when no row had it. */
  reach: number | null;
  /** Impression-weighted frequency; null when no row had it. */
  frequency: number | null;
}

export interface AdRates {
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  costPerConversion: number | null;
  conversionRate: number | null;
}

export interface Wow<T> {
  current: T;
  previous: T;
}

export type MetricDirection = "higher_better" | "lower_better" | "neutral";

export type ReportMetricKey = "spend" | "conversions" | "costPerConversion" | "impressions" | "clicks" | "ctr" | "reach" | "frequency" | "cpc" | "cpm";

export interface ReportMetricDef {
  key: ReportMetricKey;
  label: string;
  format: "currency" | "currency2" | "number" | "pct" | "multiple" | "cpm";
  direction: MetricDirection;
  /** Which platforms can supply it (undefined = all). */
  platforms?: Platform[];
  hint?: string;
}

export const REPORT_METRICS: ReportMetricDef[] = [
  { key: "spend", label: "Spend", format: "currency", direction: "neutral", hint: "Cost across connected ad platforms" },
  { key: "conversions", label: "Conversions", format: "number", direction: "higher_better", hint: "Platform primary conversions" },
  { key: "costPerConversion", label: "Cost / conversion", format: "currency2", direction: "lower_better", hint: "Spend ÷ conversions" },
  { key: "impressions", label: "Impressions", format: "number", direction: "neutral" },
  { key: "clicks", label: "Clicks", format: "number", direction: "neutral" },
  { key: "ctr", label: "CTR", format: "pct", direction: "higher_better", hint: "Clicks ÷ impressions" },
  { key: "reach", label: "Reach", format: "number", direction: "neutral", platforms: ["meta", "linkedin"], hint: "Meta / LinkedIn only" },
  { key: "frequency", label: "Frequency", format: "multiple", direction: "neutral", platforms: ["meta", "linkedin"], hint: "Impressions ÷ reach" },
  { key: "cpc", label: "CPC", format: "currency2", direction: "lower_better", hint: "Spend ÷ clicks" },
  { key: "cpm", label: "CPM", format: "cpm", direction: "lower_better", hint: "Spend ÷ impressions × 1,000" },
];

export const EMPTY_AD_TOTALS: AdTotals = { spend: 0, impressions: 0, clicks: 0, conversions: 0, reach: null, frequency: null };

interface Acc extends AdTotals {
  freqWeighted: number;
  freqImpressions: number;
}

function acc(): Acc {
  return { ...EMPTY_AD_TOTALS, freqWeighted: 0, freqImpressions: 0 };
}

function add(a: Acc, r: { spend: number; impressions: number; clicks: number; leads: number; frequency?: number }) {
  a.spend += r.spend;
  a.impressions += r.impressions;
  a.clicks += r.clicks;
  a.conversions += r.leads;
  if (typeof r.frequency === "number" && r.frequency > 0 && r.impressions > 0) {
    a.reach = (a.reach ?? 0) + r.impressions / r.frequency;
    a.freqWeighted += r.frequency * r.impressions;
    a.freqImpressions += r.impressions;
  }
}

function finish(a: Acc): AdTotals {
  return {
    spend: round2(a.spend),
    impressions: a.impressions,
    clicks: a.clicks,
    conversions: a.conversions,
    reach: a.reach === null ? null : Math.round(a.reach),
    frequency: a.freqImpressions > 0 ? round2(a.freqWeighted / a.freqImpressions) : null,
  };
}

export function sumAdTotals(list: AdTotals[]): AdTotals {
  const a = acc();
  for (const t of list) {
    a.spend += t.spend;
    a.impressions += t.impressions;
    a.clicks += t.clicks;
    a.conversions += t.conversions;
    if (t.reach !== null && t.frequency !== null) {
      a.reach = (a.reach ?? 0) + t.reach;
      a.freqWeighted += t.frequency * t.impressions;
      a.freqImpressions += t.impressions;
    }
  }
  return finish(a);
}

export function rates(t: AdTotals): AdRates {
  const cpm = safeDivide(t.spend, t.impressions);
  return {
    ctr: safeDivide(t.clicks, t.impressions),
    cpc: safeDivide(t.spend, t.clicks),
    cpm: cpm === null ? null : cpm * 1000,
    costPerConversion: safeDivide(t.spend, t.conversions),
    conversionRate: safeDivide(t.conversions, t.clicks),
  };
}

/** Read any report metric off totals + rates. */
export function metricValue(t: AdTotals, r: AdRates, key: ReportMetricKey): number | null {
  switch (key) {
    case "spend":
      return t.spend;
    case "conversions":
      return t.conversions;
    case "impressions":
      return t.impressions;
    case "clicks":
      return t.clicks;
    case "reach":
      return t.reach;
    case "frequency":
      return t.frequency;
    case "ctr":
      return r.ctr;
    case "cpc":
      return r.cpc;
    case "cpm":
      return r.cpm;
    case "costPerConversion":
      return r.costPerConversion;
  }
}

export interface MetricComparison {
  key: ReportMetricKey;
  current: number | null;
  previous: number | null;
  /** Relative change, null when the previous value is 0 or unknown. */
  change: number | null;
  /** Human verdict given the metric's direction: better / worse / neutral / flat. */
  verdict: "better" | "worse" | "neutral" | "flat" | "unknown";
}

export function compareMetric(key: ReportMetricKey, cur: { totals: AdTotals; rates: AdRates }, prev: { totals: AdTotals; rates: AdRates }): MetricComparison {
  const def = REPORT_METRICS.find((m) => m.key === key)!;
  const current = metricValue(cur.totals, cur.rates, key);
  const previous = metricValue(prev.totals, prev.rates, key);
  const change = current === null || previous === null ? null : pctChange(current, previous);
  let verdict: MetricComparison["verdict"] = "unknown";
  if (change !== null) {
    if (Math.abs(change) < 0.005) verdict = "flat";
    else if (def.direction === "neutral") verdict = "neutral";
    else verdict = (change > 0) === (def.direction === "higher_better") ? "better" : "worse";
  }
  return { key, current, previous, change, verdict };
}

// ───────────────────────────── Rows ─────────────────────────────

export interface EntityWow {
  current: AdTotals;
  previous: AdTotals;
  rates: AdRates;
  previousRates: AdRates;
  /** Deltas for the sortable table. */
  spendChange: number | null;
  conversionsChange: number | null;
  costPerConversionChange: number | null;
  ctrChange: number | null;
  cpcChange: number | null;
  frequencyChange: number | null;
}

export interface CampaignWowRow extends EntityWow {
  id: string;
  name: string;
  platform: Platform;
  status: Campaign["status"];
  channelType: string;
  dailyBudget: number;
}

export interface AdWowRow extends EntityWow {
  creative: Creative;
  campaignName: string;
  campaignId: string;
  platform: Platform;
}

export interface PlatformWowRow extends EntityWow {
  platform: Platform;
  label: string;
  connected: boolean;
  campaigns: number;
  /** Share of the blended spend delta this platform accounts for (null when total delta is 0). */
  shareOfSpendDelta: number | null;
}

export interface TrendPoint {
  date: string;
  previousDate: string;
  current: AdTotals & AdRates;
  previous: AdTotals & AdRates;
}

export interface WeeklyReportInput {
  campaigns: Campaign[];
  dailyMetrics: DailyMetric[];
  creatives: Creative[];
  creativeDailyMetrics: CreativeDailyMetric[];
  window: DateWindow;
  previous: DateWindow;
  integrations: IntegrationStatus[];
  lastSyncAt?: string;
}

export interface WeeklyReport {
  window: DateWindow;
  previous: DateWindow;
  blended: EntityWow & { metrics: MetricComparison[] };
  platforms: PlatformWowRow[];
  campaigns: CampaignWowRow[];
  ads: AdWowRow[];
  trend: TrendPoint[];
  integrity: ReportIntegrity;
}

export interface ReportIntegrity {
  sources: string[];
  lastSyncAt?: string;
  reportingPeriod: DateWindow;
  comparisonPeriod: DateWindow;
  connectedPlatforms: Platform[];
  notes: string[];
}

const inWindow = (date: string, w: DateWindow) => date >= w.start && date <= w.end;

function wowFrom(cur: Acc, prev: Acc): EntityWow {
  const current = finish(cur);
  const previous = finish(prev);
  const r = rates(current);
  const p = rates(previous);
  const chg = (a: number | null, b: number | null) => (a === null || b === null ? null : pctChange(a, b));
  return {
    current,
    previous,
    rates: r,
    previousRates: p,
    spendChange: chg(current.spend, previous.spend),
    conversionsChange: chg(current.conversions, previous.conversions),
    costPerConversionChange: chg(r.costPerConversion, p.costPerConversion),
    ctrChange: chg(r.ctr, p.ctr),
    cpcChange: chg(r.cpc, p.cpc),
    frequencyChange: chg(current.frequency, previous.frequency),
  };
}

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const { window, previous } = input;
  const campaignById = new Map(input.campaigns.map((c) => [c.id, c]));

  // Campaign rows.
  const cAcc = new Map<string, Wow<Acc>>();
  for (const m of input.dailyMetrics) {
    const cur = inWindow(m.date, window);
    const prev = !cur && inWindow(m.date, previous);
    if (!cur && !prev) continue;
    let e = cAcc.get(m.campaignId);
    if (!e) cAcc.set(m.campaignId, (e = { current: acc(), previous: acc() }));
    add(cur ? e.current : e.previous, m);
  }
  const campaigns: CampaignWowRow[] = [];
  for (const [id, e] of cAcc) {
    const c = campaignById.get(id);
    if (!c) continue;
    const w = wowFrom(e.current, e.previous);
    if (w.current.spend === 0 && w.previous.spend === 0 && w.current.impressions === 0 && w.previous.impressions === 0) continue;
    campaigns.push({ id, name: c.name, platform: c.platform, status: c.status, channelType: c.channelType, dailyBudget: c.dailyBudget, ...w });
  }
  campaigns.sort((a, b) => b.current.spend - a.current.spend || b.previous.spend - a.previous.spend);

  // Platform rows + blended.
  const platformOrder: Platform[] = ["google", "meta", "linkedin"];
  const connected = new Set<Platform>();
  const ok = (k: string) => input.integrations.some((s) => s.key === k && (s.health === "connected" || s.health === "demo"));
  if (ok("notfair") || ok("google_ads")) connected.add("google");
  if (ok("meta")) connected.add("meta");
  if (ok("linkedin")) connected.add("linkedin");
  for (const c of campaigns) if (c.current.spend > 0 || c.previous.spend > 0) connected.add(c.platform);

  const blendedAcc: Wow<Acc> = { current: acc(), previous: acc() };
  const pAcc = new Map<Platform, Wow<Acc>>(platformOrder.map((p) => [p, { current: acc(), previous: acc() }]));
  for (const m of input.dailyMetrics) {
    const c = campaignById.get(m.campaignId);
    if (!c) continue;
    const cur = inWindow(m.date, window);
    const prev = !cur && inWindow(m.date, previous);
    if (!cur && !prev) continue;
    add(cur ? blendedAcc.current : blendedAcc.previous, m);
    const e = pAcc.get(c.platform)!;
    add(cur ? e.current : e.previous, m);
  }
  const blendedWow = wowFrom(blendedAcc.current, blendedAcc.previous);
  const blendedDelta = blendedWow.current.spend - blendedWow.previous.spend;
  const platforms: PlatformWowRow[] = platformOrder.map((p) => {
    const e = pAcc.get(p)!;
    const w = wowFrom(e.current, e.previous);
    const delta = w.current.spend - w.previous.spend;
    return {
      platform: p,
      label: PLATFORM_LABEL[p],
      connected: connected.has(p),
      campaigns: campaigns.filter((c) => c.platform === p && c.current.spend > 0).length,
      shareOfSpendDelta: blendedDelta === 0 ? null : delta / blendedDelta,
      ...w,
    };
  });

  // Ads.
  const creativeById = new Map(input.creatives.map((c) => [c.id, c]));
  const aAcc = new Map<string, Wow<Acc>>();
  for (const m of input.creativeDailyMetrics) {
    const cur = inWindow(m.date, window);
    const prev = !cur && inWindow(m.date, previous);
    if (!cur && !prev) continue;
    let e = aAcc.get(m.creativeId);
    if (!e) aAcc.set(m.creativeId, (e = { current: acc(), previous: acc() }));
    add(cur ? e.current : e.previous, m);
  }
  const ads: AdWowRow[] = [];
  for (const [id, e] of aAcc) {
    const creative = creativeById.get(id);
    if (!creative) continue;
    const w = wowFrom(e.current, e.previous);
    if (w.current.impressions === 0 && w.previous.impressions === 0) continue;
    ads.push({ creative, campaignId: creative.campaignId, campaignName: campaignById.get(creative.campaignId)?.name ?? "", platform: creative.platform, ...w });
  }
  ads.sort((a, b) => b.current.spend - a.current.spend || b.current.impressions - a.current.impressions);

  // Daily trend, aligned by day offset with the previous period.
  const byDate = new Map<string, Acc>();
  for (const m of input.dailyMetrics) {
    if (!campaignById.has(m.campaignId)) continue;
    let a = byDate.get(m.date);
    if (!a) byDate.set(m.date, (a = acc()));
    add(a, m);
  }
  const curDays = dateRange(window.start, window.end);
  const prevDays = dateRange(previous.start, previous.end);
  const point = (d: string | undefined) => {
    const t = finish(byDate.get(d ?? "") ?? acc());
    return { ...t, ...rates(t) };
  };
  const trend: TrendPoint[] = curDays.map((date, i) => ({ date, previousDate: prevDays[i] ?? "", current: point(date), previous: point(prevDays[i]) }));

  const blended = { ...blendedWow, metrics: REPORT_METRICS.map((m) => compareMetric(m.key, { totals: blendedWow.current, rates: blendedWow.rates }, { totals: blendedWow.previous, rates: blendedWow.previousRates })) };

  return {
    window,
    previous,
    blended,
    platforms,
    campaigns,
    ads,
    trend,
    integrity: integrity(input, connected, campaigns, ads),
  };
}

function integrity(input: WeeklyReportInput, connected: Set<Platform>, campaigns: CampaignWowRow[], ads: AdWowRow[]): ReportIntegrity {
  const sources: string[] = [];
  const notes: string[] = [];
  const status = (k: string) => input.integrations.find((s) => s.key === k);
  const demo = input.integrations.some((s) => s.health === "demo");
  if (demo) sources.push("Demo dataset (deterministic, SketchDeck-shaped)");
  else {
    if (status("notfair")?.health === "connected") sources.push(`Google Ads via NotFair MCP${status("notfair")?.detail ? ` — ${status("notfair")!.detail}` : ""}`);
    if (status("meta")?.health === "connected") sources.push("Meta Ads");
    if (status("linkedin")?.health === "connected") sources.push("LinkedIn Ads");
  }
  if (!connected.has("meta")) notes.push("Meta Ads is not connected: reach, frequency and CPM are unavailable for Meta, and blended reach/frequency cover only platforms that report them.");
  if (!connected.has("linkedin")) notes.push("LinkedIn Ads is not connected: LinkedIn spend is not included.");
  if (connected.has("google")) notes.push("Google Ads reports no reach or frequency for Search campaigns; those cells show —.");
  const adsWithSpend = ads.filter((a) => a.current.spend > 0).length;
  const campaignSpend = campaigns.reduce((s, c) => s + c.current.spend, 0);
  const adSpend = ads.reduce((s, a) => s + a.current.spend, 0);
  if (campaignSpend > 0 && adSpend < campaignSpend * 0.9) notes.push(`Ad-level rows cover ${Math.round((adSpend / campaignSpend) * 100)}% of campaign spend this period (${adsWithSpend} ads); campaign totals are authoritative.`);
  if (connected.size && ads.every((a) => a.creative.assetStatus !== "asset" && a.creative.assetStatus !== "preview")) notes.push("No image or video asset URLs were supplied by the platforms for the ads in this period; Search ads are shown as headline / description text.");
  if (connected.has("meta") || connected.has("linkedin")) notes.push("Reach is the sum of daily reach for the period (not de-duplicated across days); frequency is impression-weighted.");
  return { sources, lastSyncAt: input.lastSyncAt, reportingPeriod: input.window, comparisonPeriod: input.previous, connectedPlatforms: [...connected], notes };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

import type { DailyMetric, MetricTotals, Campaign } from "@/types/domain";
import { addDays, parseISODate, toISODate } from "@/lib/utils/dates";

export interface DayParams {
  spend?: number;
  ctr?: number;
  cpc?: number;
  clickToLead?: number;
  leadToMql?: number;
  mqlToSql?: number;
  sqlToOpp?: number;
  dealSize?: number;
  frequency?: number;
}

// Defaults yield 100 clicks, 10 leads, 5 MQLs, 2 SQLs, 1 opportunity and $20K pipeline per day.
const DEFAULTS: Required<Omit<DayParams, "frequency">> = {
  spend: 800,
  ctr: 0.03,
  cpc: 8,
  clickToLead: 0.1,
  leadToMql: 0.5,
  mqlToSql: 0.4,
  sqlToOpp: 0.5,
  dealSize: 20_000,
};

/** Build one deterministic (noise-free) DailyMetric row from unit economics. */
export function dayRow(campaignId: string, date: string, p: DayParams = {}): DailyMetric {
  const q = { ...DEFAULTS, ...p };
  const clicks = Math.round(q.spend / q.cpc);
  const impressions = Math.round(clicks / q.ctr);
  const leads = Math.round(clicks * q.clickToLead);
  const mqls = Math.round(leads * q.leadToMql);
  const sqls = Math.round(mqls * q.mqlToSql);
  const opportunities = Math.round(sqls * q.sqlToOpp);
  const pipeline = opportunities * q.dealSize;
  const row: DailyMetric = {
    campaignId,
    date,
    spend: q.spend,
    impressions,
    clicks,
    leads,
    mqls,
    sqls,
    opportunities,
    pipeline,
    revenue: Math.round(pipeline * 0.2),
  };
  if (typeof p.frequency === "number") row.frequency = p.frequency;
  return row;
}

/**
 * Build a series of `days` rows ending on `endDate`. `paramsFor(i, daysFromEnd)`
 * lets callers shape the tail (e.g. collapse CTR on the last 2 days).
 */
export function buildSeries(
  campaignId: string,
  endDate: string,
  days: number,
  paramsFor: (dayIndex: number, daysFromEnd: number) => DayParams = () => ({}),
): DailyMetric[] {
  const end = parseISODate(endDate);
  const out: DailyMetric[] = [];
  for (let i = 0; i < days; i++) {
    const daysFromEnd = days - 1 - i;
    const date = toISODate(addDays(end, -daysFromEnd));
    out.push(dayRow(campaignId, date, paramsFor(i, daysFromEnd)));
  }
  return out;
}

export function makeTotals(over: Partial<MetricTotals> = {}): MetricTotals {
  return {
    spend: 3000,
    impressions: 100_000,
    clicks: 3_000,
    leads: 100,
    mqls: 40,
    sqls: 10,
    opportunities: 3,
    pipeline: 60_000,
    revenue: 12_000,
    ...over,
  };
}

export function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp_test",
    organizationId: "org_test",
    platform: "google",
    externalId: "ext",
    name: "Test Campaign",
    status: "active",
    objective: "lead_gen",
    dailyBudget: 100,
    currency: "USD",
    country: "US",
    industry: "Steel",
    icpSegment: "Estimators",
    channelType: "Search",
    startedAt: "2026-01-01",
    ...over,
  };
}

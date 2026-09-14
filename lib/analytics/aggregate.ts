import type { Campaign, DailyMetric, MetricTotals, Platform } from "@/types/domain";
import { sumTotals, EMPTY_TOTALS } from "@/lib/calculations/metrics";
import type { DateWindow } from "@/lib/utils/dates";

export function inWindow(m: { date: string }, w: DateWindow) {
  return m.date >= w.start && m.date <= w.end;
}

export function filterWindow<T extends { date: string }>(rows: T[], w: DateWindow): T[] {
  return rows.filter((r) => inWindow(r, w));
}

export function totalsForWindow(rows: DailyMetric[], w: DateWindow): MetricTotals {
  return sumTotals(filterWindow(rows, w));
}

export function totalsByCampaign(rows: DailyMetric[], w: DateWindow): Map<string, MetricTotals> {
  const buckets = new Map<string, DailyMetric[]>();
  for (const r of rows) {
    if (!inWindow(r, w)) continue;
    const list = buckets.get(r.campaignId) ?? [];
    list.push(r);
    buckets.set(r.campaignId, list);
  }
  const out = new Map<string, MetricTotals>();
  for (const [id, list] of buckets) out.set(id, sumTotals(list));
  return out;
}

export function totalsByPlatform(
  campaigns: Campaign[],
  rows: DailyMetric[],
  w: DateWindow,
): Map<Platform, MetricTotals> {
  const platformOf = new Map(campaigns.map((c) => [c.id, c.platform] as const));
  const buckets = new Map<Platform, DailyMetric[]>();
  for (const r of rows) {
    if (!inWindow(r, w)) continue;
    const p = platformOf.get(r.campaignId);
    if (!p) continue;
    const list = buckets.get(p) ?? [];
    list.push(r);
    buckets.set(p, list);
  }
  const out = new Map<Platform, MetricTotals>();
  for (const p of ["google", "meta", "linkedin"] as Platform[]) {
    out.set(p, sumTotals(buckets.get(p) ?? []));
  }
  return out;
}

/** Daily series across all campaigns (or a subset) for charting. */
export function dailySeries(
  rows: DailyMetric[],
  w: DateWindow,
  campaignIds?: Set<string>,
): Array<MetricTotals & { date: string }> {
  const byDate = new Map<string, DailyMetric[]>();
  for (const r of rows) {
    if (!inWindow(r, w)) continue;
    if (campaignIds && !campaignIds.has(r.campaignId)) continue;
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, list]) => ({ date, ...sumTotals(list) }));
}

export function emptyTotals(): MetricTotals {
  return { ...EMPTY_TOTALS };
}

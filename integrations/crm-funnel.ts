import type { CrmFunnelDailyMetric, CrmStage } from "@/types/domain";
import type { CrmFunnelEvent } from "./types";

/**
 * Count CRM funnel events per day, original traffic source and stage —
 * independent of paid-campaign attribution, so the dashboard can show the
 * whole funnel by channel (organic, direct, referral, paid…), not only the
 * part that maps onto ad campaigns. Deal amounts are summed per stage.
 */
export function crmFunnelDaily(events: CrmFunnelEvent[]): CrmFunnelDailyMetric[] {
  const buckets = new Map<string, CrmFunnelDailyMetric>();
  for (const e of events) {
    const date = e.occurredAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const source = normalizeSource(e.source);
    const stage: CrmStage = e.stage;
    const key = `${date}|${source}|${stage}`;
    const row = buckets.get(key) ?? { date, source, stage, count: 0, amount: 0 };
    row.count += 1;
    row.amount += e.amount ?? 0;
    buckets.set(key, row);
  }
  return [...buckets.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.source.localeCompare(b.source)));
}

/** HubSpot original-source enum, upper-cased; empty/unknown → UNKNOWN. */
export function normalizeSource(source: string | undefined): string {
  const s = (source ?? "").trim().toUpperCase();
  return s || "UNKNOWN";
}

/** Human labels for HubSpot original sources (what the CRM section shows). */
export const CRM_SOURCE_LABEL: Record<string, string> = {
  PAID_SEARCH: "Paid Search",
  PAID_SOCIAL: "Paid Social",
  ORGANIC_SEARCH: "Organic Search",
  ORGANIC_SOCIAL: "Organic Social",
  SOCIAL_MEDIA: "Organic Social",
  DIRECT_TRAFFIC: "Direct",
  REFERRALS: "Referral",
  EMAIL_MARKETING: "Email",
  OFFLINE: "Offline",
  OTHER_CAMPAIGNS: "Other campaigns",
  UNKNOWN: "Unknown",
};

export function crmSourceLabel(source: string): string {
  return CRM_SOURCE_LABEL[normalizeSource(source)] ?? titleCase(source);
}

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

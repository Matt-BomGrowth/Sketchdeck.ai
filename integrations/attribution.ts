/**
 * CRM → campaign attribution.
 *
 * Turns HubSpot funnel events (lead / MQL / SQL / opportunity / closed won)
 * into per-campaign, per-day funnel counts that the scan writes onto the
 * normalized performance rows. Rules, in order of confidence:
 *
 *   1. Campaign label match — `campaignName` (HubSpot first-touch converting
 *      campaign or source drill-down 2) equals a campaign name, normalized.
 *   2. Channel fallback — original source PAID_SEARCH → Google, PAID_SOCIAL →
 *      Meta/LinkedIn (click id decides when present); the event is credited to
 *      the platform campaign with the highest spend on that day.
 *   3. Otherwise unattributed (counted, never invented).
 *
 * Every allocation is explainable and recorded in the returned report.
 */

import type { Campaign, Platform } from "@/types/domain";
import type { CrmFunnelEvent, NormalizedCampaignMetric } from "./types";

export interface AttributedFunnelRow {
  campaignId: string;
  date: string;
  leads: number;
  mqls: number;
  sqls: number;
  opportunities: number;
  pipeline: number;
  revenue: number;
}

export interface AttributionReport {
  rows: AttributedFunnelRow[];
  matchedByName: number;
  matchedByChannel: number;
  unattributed: number;
  unattributedSamples: string[];
}

export function normalizeLabel(s: string) {
  return s
    .toLowerCase()
    .replace(/\+/g, " ")
    .replace(/%20/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function platformFor(e: CrmFunnelEvent): Platform | undefined {
  if (e.clickIds?.google) return "google";
  if (e.clickIds?.linkedin) return "linkedin";
  if (e.clickIds?.meta) return "meta";
  const src = (e.source ?? "").toUpperCase();
  if (src === "PAID_SEARCH") return "google";
  if (src === "PAID_SOCIAL") {
    const label = normalizeLabel(e.campaignName ?? "");
    if (/linkedin/.test(label)) return "linkedin";
    if (/facebook|instagram|meta/.test(label)) return "meta";
    return undefined; // ambiguous paid social without a click id
  }
  return undefined;
}

/** Spend by campaign and date, used to pick the channel-fallback campaign. */
export function spendIndex(metrics: NormalizedCampaignMetric[], externalToId: Map<string, string>) {
  const idx = new Map<string, Map<string, number>>(); // date → campaignId → spend
  for (const m of metrics) {
    const id = externalToId.get(m.externalCampaignId);
    if (!id) continue;
    const byCampaign = idx.get(m.date) ?? new Map<string, number>();
    byCampaign.set(id, (byCampaign.get(id) ?? 0) + m.spend);
    idx.set(m.date, byCampaign);
  }
  return idx;
}

export function attributeFunnelEvents(
  events: CrmFunnelEvent[],
  campaigns: Campaign[],
  spendByDate: Map<string, Map<string, number>>,
): AttributionReport {
  const byName = new Map<string, Campaign>();
  for (const c of campaigns) byName.set(normalizeLabel(c.name), c);
  const platformOf = new Map(campaigns.map((c) => [c.id, c.platform] as const));

  const acc = new Map<string, AttributedFunnelRow>();
  const bump = (campaignId: string, date: string, field: keyof Omit<AttributedFunnelRow, "campaignId" | "date">, amount: number) => {
    const key = `${campaignId}|${date}`;
    const row = acc.get(key) ?? { campaignId, date, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 };
    row[field] += amount;
    acc.set(key, row);
  };

  let matchedByName = 0;
  let matchedByChannel = 0;
  let unattributed = 0;
  const samples: string[] = [];

  for (const e of events) {
    const date = e.occurredAt.slice(0, 10);
    let campaign: Campaign | undefined;
    const label = e.campaignName ? normalizeLabel(e.campaignName) : "";
    if (label && byName.has(label)) {
      campaign = byName.get(label);
      matchedByName++;
    } else {
      const platform = platformFor(e);
      if (platform) {
        const spend = spendByDate.get(date);
        let best: { id: string; spend: number } | undefined;
        for (const c of campaigns) {
          if (platformOf.get(c.id) !== platform || c.status !== "active") continue;
          const s = spend?.get(c.id) ?? 0;
          if (!best || s > best.spend) best = { id: c.id, spend: s };
        }
        if (best) {
          campaign = campaigns.find((c) => c.id === best!.id);
          matchedByChannel++;
        }
      }
    }
    if (!campaign) {
      unattributed++;
      if (samples.length < 10) samples.push(`${e.stage} · ${e.source ?? "no source"} · ${e.campaignName ?? "no campaign"}`);
      continue;
    }
    switch (e.stage) {
      case "lead":
        bump(campaign.id, date, "leads", 1);
        break;
      case "mql":
        bump(campaign.id, date, "mqls", 1);
        break;
      case "sql":
        bump(campaign.id, date, "sqls", 1);
        break;
      case "opportunity":
        bump(campaign.id, date, "opportunities", 1);
        if (e.amount) bump(campaign.id, date, "pipeline", e.amount);
        break;
      case "closed_won":
        if (e.amount) bump(campaign.id, date, "revenue", e.amount);
        break;
      case "closed_lost":
        break;
    }
  }

  return { rows: [...acc.values()], matchedByName, matchedByChannel, unattributed, unattributedSamples: samples };
}

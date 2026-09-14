/**
 * "Why did performance change?"
 *
 * Decomposes a change in a headline metric (default: pipeline) between two
 * windows into campaign contributions, then explains each major contributor
 * with its driver metrics (CPC, conversion, MQL/SQL rates, creative fatigue).
 */

import type { Campaign, DailyMetric, FatigueAssessment, MetricTotals } from "@/types/domain";
import { deriveMetrics, pctChange, sumTotals } from "@/lib/calculations/metrics";
import { filterWindow } from "@/lib/analytics/aggregate";
import type { DateWindow } from "@/lib/utils/dates";
import { fmtCompactCurrency } from "@/lib/utils/format";

export type HeadlineMetric = "pipeline" | "sqls" | "mqls" | "leads" | "revenue";

export interface Driver {
  key: string;
  label: string;
  change: number | null;
  direction: "up" | "down" | "flat";
  hurts: boolean;
  text: string;
}

export interface Contributor {
  campaign: Campaign;
  current: MetricTotals;
  previous: MetricTotals;
  delta: number;
  /** Share of the total absolute change explained by this campaign. */
  shareOfChange: number;
  drivers: Driver[];
  fatigue?: FatigueAssessment;
  recommendation: string;
}

export interface WhyChangedReport {
  metric: HeadlineMetric;
  metricLabel: string;
  current: number;
  previous: number;
  change: number | null;
  direction: "up" | "down" | "flat";
  headline: string;
  contributors: Contributor[];
  windowLabel: string;
}

const LABELS: Record<HeadlineMetric, string> = {
  pipeline: "Pipeline",
  sqls: "SQLs",
  mqls: "MQLs",
  leads: "Leads",
  revenue: "Revenue",
};

function driver(key: string, label: string, cur: number | null, prev: number | null, higherIsBetter: boolean): Driver | null {
  if (cur === null || prev === null) return null;
  const ch = pctChange(cur, prev);
  if (ch === null || Math.abs(ch) < 0.04) return null;
  const direction = ch > 0 ? "up" : "down";
  const hurts = higherIsBetter ? ch < 0 : ch > 0;
  const arrow = ch > 0 ? "↑" : "↓";
  return { key, label, change: ch, direction, hurts, text: `${label} ${arrow} ${Math.abs(ch * 100).toFixed(0)}%` };
}

export function explainChange(
  campaigns: Campaign[],
  rows: DailyMetric[],
  current: DateWindow,
  previous: DateWindow,
  options: { metric?: HeadlineMetric; fatigueByCampaign?: Map<string, FatigueAssessment>; maxContributors?: number } = {},
): WhyChangedReport {
  const metric = options.metric ?? "pipeline";
  const curRows = filterWindow(rows, current);
  const prevRows = filterWindow(rows, previous);
  const curTotal = sumTotals(curRows);
  const prevTotal = sumTotals(prevRows);
  const change = pctChange(curTotal[metric], prevTotal[metric]);
  const direction: WhyChangedReport["direction"] = change === null || Math.abs(change) < 0.02 ? "flat" : change > 0 ? "up" : "down";

  const contributors: Contributor[] = [];
  const totalDelta = curTotal[metric] - prevTotal[metric];
  // Shares are computed against the GROSS movement in the headline direction
  // (sum of all same-direction campaign deltas) so contributor shares add up
  // to at most 100% even when other campaigns moved the opposite way.
  const perCampaign = campaigns.map((c) => {
    const cur = sumTotals(curRows.filter((r) => r.campaignId === c.id));
    const prev = sumTotals(prevRows.filter((r) => r.campaignId === c.id));
    return { c, cur, prev, delta: cur[metric] - prev[metric] };
  });
  const headlineSign = Math.sign(totalDelta);
  const gross = perCampaign.filter((x) => headlineSign === 0 || Math.sign(x.delta) === headlineSign).reduce((s, x) => s + Math.abs(x.delta), 0);

  for (const { c, cur, prev, delta } of perCampaign) {
    if (delta === 0) continue;
    const sameDirection = headlineSign === 0 || Math.sign(delta) === headlineSign;
    const shareOfChange = gross > 0 && sameDirection ? Math.min(1, Math.abs(delta) / gross) : 0;

    const cm = deriveMetrics(cur);
    const pm = deriveMetrics(prev);
    const drivers = [
      driver("spend", "Spend", cur.spend, prev.spend, true),
      driver("cpc", "CPC", cm.cpc, pm.cpc, false),
      driver("ctr", "CTR", cm.ctr, pm.ctr, true),
      driver("lead_rate", "Conversion rate", cm.leadRate, pm.leadRate, true),
      driver("mql_rate", "MQL conversion", cm.mqlRate, pm.mqlRate, true),
      driver("sql_rate", "SQL conversion", cm.sqlRate, pm.sqlRate, true),
      driver("opp_rate", "Opportunity rate", cm.opportunityRate, pm.opportunityRate, true),
    ].filter((d): d is Driver => d !== null);

    const fatigue = options.fatigueByCampaign?.get(c.id);
    if (fatigue && fatigue.status !== "healthy") {
      drivers.push({
        key: "fatigue",
        label: "Creative fatigue",
        change: null,
        direction: "down",
        hurts: true,
        text: fatigue.status === "critical" ? "Creative fatigue detected (critical)" : "Early creative fatigue detected",
      });
    }

    contributors.push({
      campaign: c,
      current: cur,
      previous: prev,
      delta,
      shareOfChange,
      drivers,
      fatigue,
      recommendation: recommendFor(c, delta, drivers, fatigue),
    });
  }

  contributors.sort((a, b) => b.shareOfChange - a.shareOfChange || Math.abs(b.delta) - Math.abs(a.delta));
  const top = contributors.slice(0, options.maxContributors ?? 4);

  const label = LABELS[metric];
  let headline: string;
  if (direction === "flat") headline = `${label} was flat ${current.label} vs. ${previous.label}.`;
  else headline = `${label} ${direction === "up" ? "increased" : "declined"} ${Math.abs((change ?? 0) * 100).toFixed(0)}% ${current.label} vs. ${previous.label} (${fmtCompactCurrency(prevTotal[metric])} → ${fmtCompactCurrency(curTotal[metric])}).`;
  if (metric !== "pipeline" && metric !== "revenue" && direction !== "flat") {
    headline = `${label} ${direction === "up" ? "increased" : "declined"} ${Math.abs((change ?? 0) * 100).toFixed(0)}% ${current.label} vs. ${previous.label} (${prevTotal[metric]} → ${curTotal[metric]}).`;
  }
  if (top[0] && top[0].shareOfChange > 0.3 && direction !== "flat") {
    headline += ` ${Math.round(top[0].shareOfChange * 100)}% of the ${direction === "up" ? "gain" : "decline"} came from ${top[0].campaign.name}.`;
  }

  return {
    metric,
    metricLabel: label,
    current: curTotal[metric],
    previous: prevTotal[metric],
    change,
    direction,
    headline,
    contributors: top,
    windowLabel: current.label,
  };
}

function recommendFor(c: Campaign, delta: number, drivers: Driver[], fatigue?: FatigueAssessment): string {
  const hurting = drivers.filter((d) => d.hurts);
  if (delta > 0) {
    const spendUp = drivers.find((d) => d.key === "spend" && d.direction === "up");
    return spendUp
      ? "Gains track added spend — hold budget and confirm SQL quality before scaling further."
      : "Efficiency improved at flat spend — candidate for a measured budget increase.";
  }
  if (fatigue && fatigue.status === "critical") return "Rotate the fatigued creative and reduce spend by 10% until CTR and conversion stabilize.";
  if (fatigue && fatigue.status === "warning") return "Prepare a creative refresh; hold budget flat this week.";
  if (hurting.some((d) => d.key === "cpc") && hurting.some((d) => d.key === "mql_rate")) {
    return "Rising CPC with weaker MQL conversion — tighten targeting/keywords and cap bids; reduce spend 10% until MQL rate recovers.";
  }
  if (hurting.some((d) => d.key === "sql_rate")) return "SQL conversion dropped — review lead routing and sales follow-up before changing media.";
  if (drivers.some((d) => d.key === "spend" && d.direction === "down")) return "Decline tracks reduced spend/impressions — check budget caps and auction share.";
  if (hurting.length === 0) return "No clear driver — monitor for another 48 hours before acting.";
  return `Investigate ${hurting.map((d) => d.label.toLowerCase()).join(", ")} before adjusting ${c.platform === "google" ? "bids" : "audiences"}.`;
}

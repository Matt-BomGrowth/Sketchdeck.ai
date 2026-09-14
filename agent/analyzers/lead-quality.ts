/**
 * Lead Quality Intelligence — compares channels on what matters in B2B:
 * not the cheapest lead, but the cheapest qualified pipeline.
 */

import type { MetricTotals, Platform } from "@/types/domain";
import { deriveMetrics, type DerivedMetrics } from "@/lib/calculations/metrics";
import { PLATFORM_LABEL, fmtCurrency, fmtPct } from "@/lib/utils/format";

export interface ChannelQuality {
  platform: Platform;
  label: string;
  totals: MetricTotals;
  metrics: DerivedMetrics;
}

export interface LeadQualityReport {
  channels: ChannelQuality[];
  insights: string[];
  /** Platform with the cheapest SQL (best qualified-pipeline efficiency). */
  bestSqlChannel?: Platform;
  /** Platform with the cheapest lead (often misleading). */
  cheapestLeadChannel?: Platform;
}

export function analyzeLeadQuality(byPlatform: Map<Platform, MetricTotals>): LeadQualityReport {
  const channels: ChannelQuality[] = [];
  for (const [platform, totals] of byPlatform) {
    if (totals.spend <= 0) continue;
    channels.push({ platform, label: PLATFORM_LABEL[platform], totals, metrics: deriveMetrics(totals) });
  }

  const withSql = channels.filter((c) => c.metrics.costPerSql !== null);
  const bestSql = [...withSql].sort((a, b) => (a.metrics.costPerSql ?? Infinity) - (b.metrics.costPerSql ?? Infinity))[0];
  const withCpl = channels.filter((c) => c.metrics.cpl !== null);
  const cheapestLead = [...withCpl].sort((a, b) => (a.metrics.cpl ?? Infinity) - (b.metrics.cpl ?? Infinity))[0];

  const insights: string[] = [];
  if (bestSql && cheapestLead && bestSql.platform !== cheapestLead.platform) {
    const ratio = (bestSql.metrics.cpl ?? 0) / (cheapestLead.metrics.cpl ?? 1);
    const sqlRatio = (cheapestLead.metrics.costPerSql ?? 0) / (bestSql.metrics.costPerSql ?? 1);
    insights.push(
      `${bestSql.label} leads cost ${ratio.toFixed(1)}× more than ${cheapestLead.label} (${fmtCurrency(bestSql.metrics.cpl)} vs ${fmtCurrency(cheapestLead.metrics.cpl)}), but produce SQLs ${sqlRatio.toFixed(1)}× cheaper (${fmtCurrency(bestSql.metrics.costPerSql)} vs ${fmtCurrency(cheapestLead.metrics.costPerSql)}).`,
    );
  } else if (bestSql) {
    insights.push(`${bestSql.label} produces the cheapest SQLs at ${fmtCurrency(bestSql.metrics.costPerSql)}.`);
  }

  for (const c of channels) {
    const lts = c.metrics.leadToSqlRate;
    if (lts !== null && lts < 0.05 && c.totals.leads >= 30) {
      insights.push(
        `${c.label}: only ${fmtPct(lts)} of leads become SQLs (${c.totals.sqls} of ${c.totals.leads}) — volume without qualification.`,
      );
    }
  }

  const bestPipeline = [...channels].sort((a, b) => (b.metrics.pipelineRoas ?? 0) - (a.metrics.pipelineRoas ?? 0))[0];
  const worstPipeline = [...channels].sort((a, b) => (a.metrics.pipelineRoas ?? 0) - (b.metrics.pipelineRoas ?? 0))[0];
  if (bestPipeline && worstPipeline && bestPipeline.platform !== worstPipeline.platform) {
    const worstRoas = worstPipeline.metrics.pipelineRoas ?? 0;
    if (worstRoas >= 0.5) {
      const x = (bestPipeline.metrics.pipelineRoas ?? 0) / worstRoas;
      insights.push(`${bestPipeline.label} generates ${x >= 10 ? Math.round(x) : x.toFixed(1)}× more pipeline per dollar than ${worstPipeline.label}.`);
    } else {
      insights.push(`${bestPipeline.label} generates ${(bestPipeline.metrics.pipelineRoas ?? 0).toFixed(1)}× pipeline ROAS; ${worstPipeline.label} produced almost no pipeline from ${fmtCurrency(worstPipeline.totals.spend)} of spend.`);
    }
  }

  return {
    channels: channels.sort((a, b) => (b.metrics.pipelineRoas ?? 0) - (a.metrics.pipelineRoas ?? 0)),
    insights,
    bestSqlChannel: bestSql?.platform,
    cheapestLeadChannel: cheapestLead?.platform,
  };
}

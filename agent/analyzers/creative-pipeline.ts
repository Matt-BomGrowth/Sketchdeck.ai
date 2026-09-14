/**
 * Creative → Pipeline analysis. Creatives are ranked by pipeline per dollar,
 * never by CTR alone.
 */

import type { Creative, CreativeDailyMetric, FatigueAssessment, HealthScore, MetricTotals } from "@/types/domain";
import { deriveMetrics, sumTotals, type DerivedMetrics } from "@/lib/calculations/metrics";
import { assessFatigue, DEFAULT_FATIGUE_THRESHOLDS } from "@/agent/detectors/fatigue";
import { computeHealthScore } from "@/agent/analyzers/health-score";
import type { DateWindow } from "@/lib/utils/dates";
import type { FatigueThresholds } from "@/types/domain";

export interface CreativeInsight {
  creative: Creative;
  totals: MetricTotals;
  metrics: DerivedMetrics;
  fatigue: FatigueAssessment;
  health: HealthScore;
  category: "top" | "underperforming" | "fatiguing" | "ab_test" | "other";
}

export interface CreativeReport {
  items: CreativeInsight[];
  top: CreativeInsight[];
  underperforming: CreativeInsight[];
  fatiguing: CreativeInsight[];
  abTests: Array<{ testGroup: string; variants: CreativeInsight[]; leader?: CreativeInsight }>;
  insights: string[];
}

export function analyzeCreatives(
  creatives: Creative[],
  rows: CreativeDailyMetric[],
  window: DateWindow,
  thresholds: FatigueThresholds = DEFAULT_FATIGUE_THRESHOLDS,
): CreativeReport {
  const inWin = rows.filter((r) => r.date >= window.start && r.date <= window.end);
  const benchmark = sumTotals(inWin);
  const items: CreativeInsight[] = creatives.map((creative) => {
    const mine = inWin.filter((r) => r.creativeId === creative.id);
    const totals = sumTotals(mine);
    const seriesForFatigue = rows
      .filter((r) => r.creativeId === creative.id)
      .map((r) => ({ ...r, campaignId: creative.campaignId }));
    const fatigue = assessFatigue(seriesForFatigue, thresholds, { isPaidSocial: creative.platform !== "google" });
    const health = computeHealthScore(totals, { benchmark, frequency: totals.frequency });
    return { creative, totals, metrics: deriveMetrics(totals), fatigue, health, category: "other" as const };
  });

  const active = items.filter((i) => i.totals.spend > 0);
  const byPipelineRoas = [...active].sort((a, b) => (b.metrics.pipelineRoas ?? 0) - (a.metrics.pipelineRoas ?? 0));
  const top = byPipelineRoas.slice(0, Math.max(3, Math.ceil(active.length * 0.2)));
  const fatiguing = active.filter((i) => i.fatigue.status !== "healthy");
  const underperforming = [...active]
    .filter((i) => !top.includes(i))
    .sort((a, b) => (a.metrics.pipelineRoas ?? 0) - (b.metrics.pipelineRoas ?? 0))
    .slice(0, Math.max(3, Math.ceil(active.length * 0.2)));

  for (const i of items) {
    if (top.includes(i)) i.category = "top";
    else if (fatiguing.includes(i)) i.category = "fatiguing";
    else if (underperforming.includes(i)) i.category = "underperforming";
    if (i.creative.testGroup) i.category = i.category === "other" ? "ab_test" : i.category;
  }

  const groups = new Map<string, CreativeInsight[]>();
  for (const i of items) {
    if (!i.creative.testGroup) continue;
    const list = groups.get(i.creative.testGroup) ?? [];
    list.push(i);
    groups.set(i.creative.testGroup, list);
  }
  const abTests = [...groups.entries()].map(([testGroup, variants]) => ({
    testGroup,
    variants: variants.sort((a, b) => (a.creative.variant ?? "").localeCompare(b.creative.variant ?? "")),
    leader: [...variants].sort((a, b) => (b.metrics.pipelineRoas ?? 0) - (a.metrics.pipelineRoas ?? 0))[0],
  }));

  const insights: string[] = [];
  // Classic B2B insight: the creative with fewer leads but far more pipeline per dollar.
  const byLeads = [...active].sort((a, b) => b.totals.leads - a.totals.leads);
  const leadLeader = byLeads[0];
  const pipeLeader = byPipelineRoas[0];
  if (leadLeader && pipeLeader && leadLeader !== pipeLeader && (leadLeader.metrics.pipelineRoas ?? 0) > 0) {
    const x = (pipeLeader.metrics.pipelineRoas ?? 0) / (leadLeader.metrics.pipelineRoas ?? 1);
    if (x >= 1.5) {
      insights.push(
        `${pipeLeader.creative.name} produces fewer leads than ${leadLeader.creative.name} (${pipeLeader.totals.leads} vs ${leadLeader.totals.leads}) but ${x.toFixed(1)}× more pipeline per dollar.`,
      );
    }
  }
  const byCtr = [...active].sort((a, b) => (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0));
  if (byCtr[0] && byCtr[0] !== pipeLeader && (byCtr[0].metrics.pipelineRoas ?? 0) < (benchmark.pipeline / Math.max(benchmark.spend, 1))) {
    insights.push(`${byCtr[0].creative.name} has the highest CTR but below-average pipeline ROAS — clicks are not converting to qualified pipeline.`);
  }
  if (fatiguing.length) insights.push(`${fatiguing.length} creative${fatiguing.length > 1 ? "s" : ""} showing fatigue; rotation recommended.`);

  return { items, top, underperforming, fatiguing, abTests, insights };
}

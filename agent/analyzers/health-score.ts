/**
 * Campaign Health Score (0–100).
 *
 * Designed so CTR cannot dominate: pipeline-quality components carry ~60% of
 * the weight, funnel quality ~25%, and top-of-funnel efficiency ~15%.
 * Each component is scored relative to the account (portfolio) benchmark, so
 * the score answers "how healthy is this campaign for THIS business?"
 */

import type { HealthScore, HealthStatus, MetricTotals } from "@/types/domain";
import { deriveMetrics } from "@/lib/calculations/metrics";

export interface HealthContext {
  /** Portfolio-level benchmark totals (all campaigns, same window). */
  benchmark: MetricTotals;
  /** Impression trend vs. previous window, e.g. -0.2 = 20% fewer impressions. */
  impressionTrend?: number | null;
  /** Historical pipeline ROAS for this campaign (previous window). */
  historicalPipelineRoas?: number | null;
  /** Average frequency (paid social); undefined for search. */
  frequency?: number;
}

interface Component {
  key: string;
  label: string;
  weight: number;
  score: number; // 0..100
}

/** Score a ratio against a benchmark: 1.0× → 60, 2× → ~90, 0.5× → ~30. */
function ratioScore(value: number | null, benchmark: number | null, higherIsBetter = true): number {
  if (value === null || benchmark === null || benchmark === 0) return 50;
  let ratio = value / benchmark;
  if (!higherIsBetter) ratio = ratio === 0 ? 3 : 1 / ratio;
  // log2 mapping: ratio 1 → 60; each doubling adds 20 points; clamp.
  const s = 60 + 20 * Math.log2(Math.max(ratio, 0.2));
  return Math.max(0, Math.min(100, s));
}

export function computeHealthScore(totals: MetricTotals, ctx: HealthContext): HealthScore {
  const m = deriveMetrics(totals);
  const b = deriveMetrics(ctx.benchmark);

  const components: Component[] = [
    { key: "pipeline_roas", label: "Pipeline ROAS", weight: 0.22, score: ratioScore(m.pipelineRoas, b.pipelineRoas) },
    { key: "revenue_roas", label: "Revenue ROAS", weight: 0.12, score: ratioScore(m.roas, b.roas) },
    { key: "cost_per_sql", label: "Cost per SQL", weight: 0.14, score: ratioScore(m.costPerSql, b.costPerSql, false) },
    { key: "sql_rate", label: "SQL rate", weight: 0.10, score: ratioScore(m.sqlRate, b.sqlRate) },
    { key: "opportunity_rate", label: "Opportunity rate", weight: 0.08, score: ratioScore(m.opportunityRate, b.opportunityRate) },
    { key: "mql_rate", label: "MQL rate (lead quality)", weight: 0.08, score: ratioScore(m.mqlRate, b.mqlRate) },
    { key: "lead_rate", label: "Conversion rate", weight: 0.06, score: ratioScore(m.leadRate, b.leadRate) },
    { key: "ctr", label: "CTR", weight: 0.05, score: ratioScore(m.ctr, b.ctr) },
    { key: "cpc", label: "CPC", weight: 0.05, score: ratioScore(m.cpc, b.cpc, false) },
  ];

  // Frequency (paid social only): penalize saturation above 4.
  if (typeof ctx.frequency === "number") {
    const f = ctx.frequency;
    const s = f <= 2.5 ? 85 : f <= 4 ? 65 : f <= 6 ? 40 : 20;
    components.push({ key: "frequency", label: "Frequency", weight: 0.04, score: s });
  }

  // Impression trend: reward stability, penalize sharp declines.
  if (typeof ctx.impressionTrend === "number") {
    const t = ctx.impressionTrend;
    const s = t >= 0.1 ? 80 : t >= -0.1 ? 70 : t >= -0.3 ? 45 : 25;
    components.push({ key: "impression_trend", label: "Impression trend", weight: 0.03, score: s });
  }

  // Historical performance: is pipeline ROAS holding up vs. its own history?
  if (typeof ctx.historicalPipelineRoas === "number" && ctx.historicalPipelineRoas > 0 && m.pipelineRoas !== null) {
    const r = m.pipelineRoas / ctx.historicalPipelineRoas;
    const s = r >= 1.1 ? 85 : r >= 0.9 ? 70 : r >= 0.7 ? 45 : 25;
    components.push({ key: "historical", label: "vs. own history", weight: 0.03, score: s });
  }

  // Low-data guard: campaigns with almost no spend get a neutral score.
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  let score = components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight;
  if (totals.spend < 50 || totals.impressions < 200) score = 50 + (score - 50) * 0.3;

  score = Math.round(Math.max(0, Math.min(100, score)));
  return { score, status: healthStatus(score), label: healthLabel(score), components };
}

export function healthStatus(score: number): HealthStatus {
  if (score >= 70) return "healthy";
  if (score >= 55) return "watch";
  if (score >= 40) return "at_risk";
  return "critical";
}

export function healthLabel(score: number): string {
  switch (healthStatus(score)) {
    case "healthy":
      return "Healthy";
    case "watch":
      return "Watch";
    case "at_risk":
      return "At risk";
    case "critical":
      return "Critical";
  }
}

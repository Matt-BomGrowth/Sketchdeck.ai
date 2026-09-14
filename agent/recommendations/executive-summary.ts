/**
 * AI Executive Summary — generated from data, never hard-coded.
 */

import type { MetricTotals, Platform, Recommendation } from "@/types/domain";
import type { CampaignAssessment } from "./next-best-action";
import type { BudgetPlan } from "@/agent/optimizers/budget-optimizer";
import { deriveMetrics, pctChange } from "@/lib/calculations/metrics";
import { fmtCompactCurrency, fmtMultiple, fmtSignedPct, PLATFORM_LABEL } from "@/lib/utils/format";

export interface ExecutiveSummaryInput {
  windowLabel: string;
  current: MetricTotals;
  previous: MetricTotals;
  byPlatform: Map<Platform, MetricTotals>;
  assessments: CampaignAssessment[];
  plan: BudgetPlan;
  recommendations: Recommendation[];
}

export interface ExecutiveSummary {
  sentences: string[];
  pipelineChange: number | null;
  fatigueCount: { critical: number; warning: number };
  reallocation: number;
  opportunityLow: number;
  opportunityHigh: number;
}

export function buildExecutiveSummary(input: ExecutiveSummaryInput): ExecutiveSummary {
  const s: string[] = [];
  const pipelineChange = pctChange(input.current.pipeline, input.previous.pipeline);

  if (pipelineChange !== null && Math.abs(pipelineChange) >= 0.02) {
    s.push(`Pipeline ${pipelineChange > 0 ? "increased" : "decreased"} ${Math.abs(pipelineChange * 100).toFixed(0)}% over the ${input.windowLabel} (${fmtCompactCurrency(input.previous.pipeline)} → ${fmtCompactCurrency(input.current.pipeline)}).`);
  } else {
    s.push(`Pipeline was flat over the ${input.windowLabel} at ${fmtCompactCurrency(input.current.pipeline)}.`);
  }

  // Channel efficiency comparison
  const platforms = [...input.byPlatform.entries()].filter(([, t]) => t.spend > 0).map(([p, t]) => ({ p, t, m: deriveMetrics(t) }));
  const sorted = [...platforms].sort((a, b) => (b.m.pipelineRoas ?? 0) - (a.m.pipelineRoas ?? 0));
  if (sorted.length >= 2) {
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const bestCampaign = input.assessments
      .filter((a) => a.campaign.platform === best.p && a.campaign.status === "active")
      .sort((a, b) => b.totals.pipeline - a.totals.pipeline)[0];
    const lead = `${PLATFORM_LABEL[best.p]}${bestCampaign ? ` (led by ${shortName(bestCampaign.campaign.name)})` : ""}`;
    const worstRoas = worst.m.pipelineRoas ?? 0;
    if (worstRoas < 0.5) {
      s.push(`${lead} is generating ${fmtMultiple(best.m.pipelineRoas)} pipeline ROAS, while ${PLATFORM_LABEL[worst.p]} produced almost no pipeline from ${fmtCompactCurrency(worst.t.spend)} of spend.`);
    } else {
      const ratio = (best.m.pipelineRoas ?? 0) / worstRoas;
      s.push(`${lead} is generating ${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× more pipeline per dollar than ${PLATFORM_LABEL[worst.p]}.`);
    }
  }

  const critical = input.assessments.filter((a) => a.fatigue.status === "critical" && a.campaign.status === "active");
  const warning = input.assessments.filter((a) => a.fatigue.status === "warning" && a.campaign.status === "active");
  if (critical.length + warning.length > 0) {
    const byPlatform = new Map<Platform, number>();
    for (const a of [...critical, ...warning]) byPlatform.set(a.campaign.platform, (byPlatform.get(a.campaign.platform) ?? 0) + 1);
    const parts = [...byPlatform.entries()].map(([p, n]) => `${n} ${PLATFORM_LABEL[p].replace(" Ads", "")}`);
    const total = critical.length + warning.length;
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
    s.push(`${list} campaign${total > 1 ? "s" : ""} show${total === 1 ? "s" : ""} ${critical.length > 0 ? `creative fatigue (${critical.length} critical)` : "early fatigue"}.`);
  }

  const reallocation = input.plan.totalMovePeriod;
  const budgetRecs = input.recommendations.filter((r) => r.type === "budget_increase");
  const low = budgetRecs.reduce((a, r) => a + r.expectedImpact.pipelineLow, 0);
  const high = budgetRecs.reduce((a, r) => a + r.expectedImpact.pipelineHigh, 0);
  if (reallocation > 0 && input.plan.increases.length > 0) {
    s.push(`AI recommends reallocating ${fmtCompactCurrency(reallocation)} toward ${input.plan.increases.length} high-performing campaign${input.plan.increases.length > 1 ? "s" : ""}. Estimated pipeline opportunity: ${fmtCompactCurrency(low)}–${fmtCompactCurrency(high)}.`);
  }

  const sqlChange = pctChange(input.current.sqls, input.previous.sqls);
  if (sqlChange !== null && Math.abs(sqlChange) >= 0.15) {
    s.push(`SQLs ${fmtSignedPct(sqlChange)} (${input.previous.sqls} → ${input.current.sqls}) — ${sqlChange > 0 ? "sales-ready demand is growing" : "watch qualification and follow-up speed"}.`);
  }

  return {
    sentences: s,
    pipelineChange,
    fatigueCount: { critical: critical.length, warning: warning.length },
    reallocation,
    opportunityLow: low,
    opportunityHigh: high,
  };
}

function shortName(name: string) {
  const parts = name.split("|").map((p) => p.trim());
  return parts.length >= 2 ? parts.slice(1, 3).join(" · ") : name;
}

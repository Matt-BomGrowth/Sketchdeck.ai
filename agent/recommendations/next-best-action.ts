/**
 * Next Best Action generator.
 *
 * Turns detector/analyzer output into explainable recommendations with
 * What happened / Why / Recommended action / Expected impact / Confidence.
 * Every recommendation that changes a live account is marked requiresApproval.
 */

import type {
  AutomationPolicy,
  Campaign,
  FatigueAssessment,
  HealthScore,
  MetricTotals,
  Recommendation,
} from "@/types/domain";
import type { Anomaly } from "@/agent/detectors/anomaly";
import type { BudgetPlan } from "@/agent/optimizers/budget-optimizer";
import { deriveMetrics } from "@/lib/calculations/metrics";
import { evaluatePolicy } from "@/agent/actions/policy";
import { fmtCurrency, fmtPct, fmtMultiple } from "@/lib/utils/format";

export interface CampaignAssessment {
  campaign: Campaign;
  totals: MetricTotals;
  previous: MetricTotals;
  health: HealthScore;
  fatigue: FatigueAssessment;
  anomalies: Anomaly[];
}

export interface RecommendationContext {
  organizationId: string;
  benchmark: MetricTotals;
  windowDays: number;
  policy: AutomationPolicy;
  now: Date;
  scanRunId?: string;
}

let counter = 0;
function recId(prefix: string, key: string) {
  counter += 1;
  return `rec_${prefix}_${key}_${counter}`;
}

export function resetRecommendationIds() {
  counter = 0;
}

export function generateRecommendations(
  assessments: CampaignAssessment[],
  plan: BudgetPlan,
  ctx: RecommendationContext,
): Recommendation[] {
  const out: Recommendation[] = [];
  const bm = deriveMetrics(ctx.benchmark);
  const scale = 30 / ctx.windowDays; // normalize impact to monthly

  // 1) Budget plan: increases for Top 3, decreases for Bottom 30%.
  for (const inc of plan.increases) {
    const a = assessments.find((x) => x.campaign.id === inc.campaignId);
    if (!a || inc.deltaDaily <= 0) continue;
    const m = deriveMetrics(a.totals);
    const pipelinePerDollar = m.pipelineRoas ?? 0;
    const monthly = inc.deltaDaily * 30;
    const low = Math.round(monthly * pipelinePerDollar * 0.45);
    const high = Math.round(monthly * pipelinePerDollar * 0.8);
    out.push(finalize({
      id: recId("budget_up", a.campaign.id),
      organizationId: ctx.organizationId,
      campaignId: a.campaign.id,
      platform: a.campaign.platform,
      type: "budget_increase",
      priority: "high",
      title: `Increase budget: ${a.campaign.name}`,
      whatHappened: `${a.campaign.name} ranks #${plan.top.findIndex((t) => t.campaign.id === a.campaign.id) + 1} on pipeline quality with ${fmtMultiple(m.pipelineRoas)} pipeline ROAS vs ${fmtMultiple(bm.pipelineRoas)} account average and ${a.totals.sqls} SQLs at ${fmtCurrency(m.costPerSql)} each.`,
      why: `Pipeline ROAS is ${((m.pipelineRoas ?? 0) / Math.max(bm.pipelineRoas ?? 1, 0.01)).toFixed(1)}× the account average and SQL conversion (${fmtPct(m.sqlRate)}) is above benchmark (${fmtPct(bm.sqlRate)}). Additional spend should convert at similar quality with modest diminishing returns.`,
      recommendedAction: `Raise daily budget from ${fmtCurrency(inc.currentDaily)} to ${fmtCurrency(inc.proposedDaily)} (+${fmtCurrency(inc.deltaDaily)}/day), funded by the bottom-30% reductions.`,
      expectedImpact: { pipelineLow: low, pipelineHigh: high, sqls: Math.round(monthly * ((a.totals.sqls / Math.max(a.totals.spend, 1)) * 0.7)) },
      confidence: Math.min(0.9, 0.5 + a.totals.sqls / 40),
      status: "pending",
      budgetChange: { from: inc.currentDaily, to: inc.proposedDaily, unit: "per_day" },
      requiresApproval: true,
      createdAt: ctx.now.toISOString(),
      scanRunId: ctx.scanRunId,
    }, ctx.policy));
  }

  for (const dec of plan.decreases) {
    const a = assessments.find((x) => x.campaign.id === dec.campaignId);
    if (!a || dec.deltaDaily >= 0) continue;
    const m = deriveMetrics(a.totals);
    const monthlyCut = Math.abs(dec.deltaDaily) * 30;
    const waste = Math.round(monthlyCut * (1 - Math.min(1, (m.pipelineRoas ?? 0) / Math.max(bm.pipelineRoas ?? 1, 0.01))));
    out.push(finalize({
      id: recId("budget_down", a.campaign.id),
      organizationId: ctx.organizationId,
      campaignId: a.campaign.id,
      platform: a.campaign.platform,
      type: "budget_decrease",
      priority: (m.pipelineRoas ?? 0) < (bm.pipelineRoas ?? 0) * 0.3 ? "high" : "medium",
      title: `Reduce budget: ${a.campaign.name}`,
      whatHappened: `${a.campaign.name} sits in the bottom 30% on pipeline quality: ${fmtMultiple(m.pipelineRoas)} pipeline ROAS, ${a.totals.sqls} SQL${a.totals.sqls === 1 ? "" : "s"} from ${fmtCurrency(a.totals.spend)} spend${a.totals.leads > 0 ? ` (${fmtPct(m.leadToSqlRate)} lead→SQL)` : ""}.`,
      why: a.totals.leads >= 30 && (m.leadToSqlRate ?? 0) < 0.05
        ? `High lead volume but almost none qualify — ${a.totals.leads} leads produced ${a.totals.sqls} SQLs. This is CTR/lead volume without pipeline.`
        : `Cost per SQL (${fmtCurrency(m.costPerSql)}) is well above the account benchmark (${fmtCurrency(bm.costPerSql)}); budget produces more pipeline elsewhere.`,
      recommendedAction: `Lower daily budget from ${fmtCurrency(dec.currentDaily)} to ${fmtCurrency(dec.proposedDaily)} (${fmtCurrency(dec.deltaDaily)}/day) and reallocate to the Top 3 campaigns.`,
      expectedImpact: { pipelineLow: 0, pipelineHigh: 0, wasteAvoided: waste },
      confidence: Math.min(0.85, 0.45 + a.totals.leads / 200),
      status: "pending",
      budgetChange: { from: dec.currentDaily, to: dec.proposedDaily, unit: "per_day" },
      requiresApproval: true,
      createdAt: ctx.now.toISOString(),
      scanRunId: ctx.scanRunId,
    }, ctx.policy));
  }

  // 2) Fatigue → creative rotation (+ temporary spend reduction when critical).
  for (const a of assessments) {
    if (a.fatigue.status === "healthy" || a.campaign.status !== "active") continue;
    const m = deriveMetrics(a.totals);
    const critical = a.fatigue.status === "critical";
    const cut = Math.round(a.campaign.dailyBudget * 0.1 * 100) / 100;
    out.push(finalize({
      id: recId("fatigue", a.campaign.id),
      organizationId: ctx.organizationId,
      campaignId: a.campaign.id,
      platform: a.campaign.platform,
      type: "rotate_creative",
      priority: critical ? "critical" : "medium",
      title: `${critical ? "Rotate creative now" : "Prepare creative refresh"}: ${a.campaign.name}`,
      whatHappened: `Fatigue score ${a.fatigue.score}/100 (${a.fatigue.status}). ${a.fatigue.reasons.slice(0, 2).join("; ")}.`,
      why: `Sustained CTR/CPC deterioration with weakening conversion indicates the audience has seen the current creative too often. Continuing to spend at full budget buys more expensive, lower-quality clicks.`,
      recommendedAction: critical
        ? `Rotate in the fresh variant and reduce spend by 10% (${fmtCurrency(a.campaign.dailyBudget)} → ${fmtCurrency(a.campaign.dailyBudget - cut)}/day) until CTR and MQL rate stabilize.`
        : `Queue a new creative variant this week; hold budget flat and re-check in 48 hours.`,
      expectedImpact: {
        pipelineLow: 0,
        pipelineHigh: Math.round(a.totals.pipeline * scale * 0.15),
        wasteAvoided: critical ? Math.round(cut * 30 * 0.6) : Math.round(a.totals.spend * scale * 0.05),
      },
      confidence: critical ? 0.78 : 0.6,
      status: "pending",
      budgetChange: critical ? { from: a.campaign.dailyBudget, to: Math.round((a.campaign.dailyBudget - cut) * 100) / 100, unit: "per_day" } : undefined,
      requiresApproval: true,
      createdAt: ctx.now.toISOString(),
      scanRunId: ctx.scanRunId,
    }, ctx.policy));
    void m;
  }

  // 3) High CTR / poor quality → audience/offer shift (investigate).
  for (const a of assessments) {
    const m = deriveMetrics(a.totals);
    if (a.campaign.status !== "active") continue;
    if ((m.ctr ?? 0) > (bm.ctr ?? 0) * 1.8 && a.totals.leads >= 40 && (m.leadToSqlRate ?? 0) < 0.04) {
      if (out.some((r) => r.campaignId === a.campaign.id && r.type === "budget_decrease")) continue;
      out.push(finalize({
        id: recId("quality", a.campaign.id),
        organizationId: ctx.organizationId,
        campaignId: a.campaign.id,
        platform: a.campaign.platform,
        type: "audience_shift",
        priority: "medium",
        title: `Tighten qualification: ${a.campaign.name}`,
        whatHappened: `CTR ${fmtPct(m.ctr, 2)} is ${((m.ctr ?? 0) / Math.max(bm.ctr ?? 0.001, 0.001)).toFixed(1)}× the account average, but only ${fmtPct(m.leadToSqlRate)} of ${a.totals.leads} leads became SQLs.`,
        why: `The offer attracts clicks and form fills from outside SketchDeck's ICP (estimators and owners at fabricators). Cheap leads are inflating CPL efficiency while producing almost no pipeline.`,
        recommendedAction: `Add job-title/company-size qualification (estimating roles, 10+ employee fabricators), switch to a demo-request offer, and exclude consumer/student interest audiences.`,
        expectedImpact: { pipelineLow: Math.round(a.totals.spend * scale * 0.5), pipelineHigh: Math.round(a.totals.spend * scale * 2), wasteAvoided: Math.round(a.totals.spend * scale * 0.35) },
        confidence: 0.62,
        status: "pending",
        requiresApproval: true,
        createdAt: ctx.now.toISOString(),
        scanRunId: ctx.scanRunId,
      }, ctx.policy));
    }
  }

  // 4) Anomalies → investigate.
  for (const a of assessments) {
    for (const an of a.anomalies.filter((x) => x.severity === "high").slice(0, 1)) {
      out.push(finalize({
        id: recId("anomaly", a.campaign.id),
        organizationId: ctx.organizationId,
        campaignId: a.campaign.id,
        platform: a.campaign.platform,
        type: "investigate",
        priority: an.metric === "spend" && an.direction === "spike" ? "high" : "medium",
        title: `${an.direction === "spike" ? "Spike" : "Drop"} in ${an.metric}: ${a.campaign.name}`,
        whatHappened: `${an.metric} on ${an.date} was ${an.value.toLocaleString()} vs. an expected ${Math.round(an.expected).toLocaleString()} (robust z-score ${an.zScore.toFixed(1)}).`,
        why: `This is outside the normal daily range for the campaign. Common causes: budget or bid changes, tracking breakage, auction shifts, or a new competitor.`,
        recommendedAction: `Check the platform change history and conversion tracking before adjusting budget. No automatic change proposed.`,
        expectedImpact: { pipelineLow: 0, pipelineHigh: 0 },
        confidence: 0.55,
        status: "pending",
        requiresApproval: false,
        createdAt: ctx.now.toISOString(),
        scanRunId: ctx.scanRunId,
      }, ctx.policy));
    }
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return out.sort((a, b) => order[a.priority] - order[b.priority] || b.expectedImpact.pipelineHigh - a.expectedImpact.pipelineHigh);
}

function finalize(rec: Recommendation, policy: AutomationPolicy): Recommendation {
  if (!rec.requiresApproval) return rec;
  const decision = evaluatePolicy(rec, policy);
  return { ...rec, requiresApproval: !decision.allowedWithoutApproval };
}

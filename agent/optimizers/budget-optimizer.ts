/**
 * AI Budget Optimizer.
 *
 * Ranks campaigns by a pipeline-quality score (NOT CTR), identifies the Top 3
 * and Bottom 30%, and proposes moving 20% of the eligible bottom budget to the
 * top performers. All proposals REQUIRE APPROVAL by default.
 */

import type { Campaign, MetricTotals } from "@/types/domain";
import { deriveMetrics } from "@/lib/calculations/metrics";

export interface RankedCampaign {
  campaign: Campaign;
  totals: MetricTotals;
  qualityScore: number;
  rank: number;
}

export interface BudgetMove {
  campaignId: string;
  campaignName: string;
  platform: Campaign["platform"];
  currentDaily: number;
  proposedDaily: number;
  deltaDaily: number;
  /** Delta over the planning horizon (default 30 days). */
  deltaPeriod: number;
}

export interface BudgetPlan {
  top: RankedCampaign[];
  bottom: RankedCampaign[];
  eligibleBottomBudgetDaily: number;
  reallocationPct: number;
  totalMoveDaily: number;
  totalMovePeriod: number;
  horizonDays: number;
  decreases: BudgetMove[];
  increases: BudgetMove[];
  requiresApproval: true;
  rationale: string[];
}

/** Composite quality score: pipeline ROAS, SQL conversion, opportunity rate, revenue, cost/SQL, lead quality. */
export function qualityScore(totals: MetricTotals, benchmark: MetricTotals): number {
  const m = deriveMetrics(totals);
  const b = deriveMetrics(benchmark);
  const rel = (v: number | null, bv: number | null, higherBetter = true) => {
    if (v === null || bv === null || bv === 0) return 1;
    const r = v / bv;
    return higherBetter ? r : r === 0 ? 3 : 1 / r;
  };
  const parts = [
    { w: 0.30, v: rel(m.pipelineRoas, b.pipelineRoas) },
    { w: 0.15, v: rel(m.sqlRate, b.sqlRate) },
    { w: 0.12, v: rel(m.opportunityRate, b.opportunityRate) },
    { w: 0.13, v: rel(m.roas, b.roas) },
    { w: 0.18, v: rel(m.costPerSql, b.costPerSql, false) },
    { w: 0.12, v: rel(m.mqlRate, b.mqlRate) },
  ];
  const s = parts.reduce((acc, p) => acc + p.w * Math.log2(Math.max(p.v, 0.05)), 0);
  // Center at 50; each doubling of overall quality is +20.
  let score = 50 + 20 * s;
  // Low-signal penalty: not enough SQLs to trust the score.
  if (totals.sqls < 2) score -= 10;
  if (totals.spend < 500) score -= 8;
  return Math.max(0, Math.min(100, score));
}

export function rankCampaigns(
  items: Array<{ campaign: Campaign; totals: MetricTotals }>,
  benchmark: MetricTotals,
): RankedCampaign[] {
  return items
    .map(({ campaign, totals }) => ({ campaign, totals, qualityScore: qualityScore(totals, benchmark), rank: 0 }))
    .sort((a, b) => b.qualityScore - a.qualityScore || b.totals.pipeline - a.totals.pipeline)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export function topN(ranked: RankedCampaign[], n = 3, exclude: Set<string> = new Set()): RankedCampaign[] {
  return ranked.filter((r) => r.campaign.status === "active" && !exclude.has(r.campaign.id)).slice(0, n);
}

export function bottomPct(ranked: RankedCampaign[], pct = 0.3): RankedCampaign[] {
  const active = ranked.filter((r) => r.campaign.status === "active");
  const count = Math.max(1, Math.floor(active.length * pct));
  return active.slice(-count);
}

export function buildBudgetPlan(
  items: Array<{ campaign: Campaign; totals: MetricTotals }>,
  benchmark: MetricTotals,
  options: { reallocationPct?: number; horizonDays?: number; topCount?: number; bottomPct?: number; excludeFromTop?: Set<string> } = {},
): BudgetPlan {
  const reallocationPct = options.reallocationPct ?? 0.2;
  const horizonDays = options.horizonDays ?? 30;
  // A campaign with no budget and no spend (e.g. one known only from CRM
  // attribution) has nothing to move in either direction.
  const ranked = rankCampaigns(items.filter((i) => i.campaign.dailyBudget > 0 || i.totals.spend > 0), benchmark);
  // Campaigns with critical fatigue are never scaled up, however good their trailing numbers.
  const top = topN(ranked, options.topCount ?? 3, options.excludeFromTop);
  const topIds = new Set(top.map((t) => t.campaign.id));
  const bottom = bottomPct(ranked, options.bottomPct ?? 0.3).filter((b) => !topIds.has(b.campaign.id));

  const eligibleBottomBudgetDaily = bottom.reduce((s, b) => s + b.campaign.dailyBudget, 0);
  const totalMoveDaily = round2(eligibleBottomBudgetDaily * reallocationPct);

  const decreases: BudgetMove[] = bottom.map((b) => {
    const delta = -round2(b.campaign.dailyBudget * reallocationPct);
    return move(b.campaign, delta, horizonDays);
  });

  // Distribute increases weighted by quality score (so the best gets a bit more), but keep it near-even.
  const weights = top.map((t) => Math.max(t.qualityScore, 1));
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  let allocated = 0;
  const increases: BudgetMove[] = top.map((t, i) => {
    const isLast = i === top.length - 1;
    const share = isLast ? round2(totalMoveDaily - allocated) : round2((totalMoveDaily * weights[i]) / weightSum);
    allocated += share;
    return move(t.campaign, share, horizonDays);
  });

  const rationale = [
    `Top ${top.length} campaigns are ranked by pipeline ROAS, SQL conversion, opportunity rate, revenue, cost per SQL and lead quality — not CTR.`,
    `Bottom ${Math.round((options.bottomPct ?? 0.3) * 100)}% of active campaigns hold $${eligibleBottomBudgetDaily.toFixed(0)}/day of eligible budget.`,
    `Moving ${Math.round(reallocationPct * 100)}% of that budget shifts $${totalMoveDaily.toFixed(0)}/day (≈ $${(totalMoveDaily * horizonDays).toFixed(0)} over ${horizonDays} days) to the top performers.`,
  ];

  return {
    top,
    bottom,
    eligibleBottomBudgetDaily: round2(eligibleBottomBudgetDaily),
    reallocationPct,
    totalMoveDaily,
    totalMovePeriod: round2(totalMoveDaily * horizonDays),
    horizonDays,
    decreases,
    increases,
    requiresApproval: true,
    rationale,
  };
}

function move(c: Campaign, deltaDaily: number, horizonDays: number): BudgetMove {
  return {
    campaignId: c.id,
    campaignName: c.name,
    platform: c.platform,
    currentDaily: c.dailyBudget,
    proposedDaily: round2(c.dailyBudget + deltaDaily),
    deltaDaily: round2(deltaDaily),
    deltaPeriod: round2(deltaDaily * horizonDays),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

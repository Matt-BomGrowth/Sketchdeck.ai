/**
 * "What if?" budget simulator.
 *
 * Estimates the funnel impact of moving budget from low performers to top
 * performers using each campaign's observed unit economics with diminishing
 * returns applied to the receiving campaigns. All outputs are ESTIMATES.
 */

import type { Campaign, MetricTotals } from "@/types/domain";
import { funnelRates } from "@/lib/calculations/funnel";
import type { RankedCampaign } from "./budget-optimizer";

export interface SimulationInput {
  amount: number; // total budget to move over the window
  windowDays: number;
  sources: RankedCampaign[];
  targets: RankedCampaign[];
  /** Diminishing returns exponent for added spend (0.7–0.9 typical). */
  elasticity?: number;
}

export interface SimulationDelta {
  leads: number;
  mqls: number;
  sqls: number;
  opportunities: number;
  pipeline: number;
  revenue: number;
}

export interface SimulationResult {
  estimated: true;
  amount: number;
  windowDays: number;
  removed: SimulationDelta;
  added: SimulationDelta;
  net: SimulationDelta;
  confidence: number; // 0..1
  confidenceLabel: "Low" | "Medium" | "High";
  notes: string[];
}

function perDollar(t: MetricTotals): SimulationDelta {
  const s = t.spend > 0 ? t.spend : 1;
  return {
    leads: t.leads / s,
    mqls: t.mqls / s,
    sqls: t.sqls / s,
    opportunities: t.opportunities / s,
    pipeline: t.pipeline / s,
    revenue: t.revenue / s,
  };
}

function scale(d: SimulationDelta, k: number): SimulationDelta {
  return {
    leads: d.leads * k,
    mqls: d.mqls * k,
    sqls: d.sqls * k,
    opportunities: d.opportunities * k,
    pipeline: d.pipeline * k,
    revenue: d.revenue * k,
  };
}

function add(a: SimulationDelta, b: SimulationDelta): SimulationDelta {
  return {
    leads: a.leads + b.leads,
    mqls: a.mqls + b.mqls,
    sqls: a.sqls + b.sqls,
    opportunities: a.opportunities + b.opportunities,
    pipeline: a.pipeline + b.pipeline,
    revenue: a.revenue + b.revenue,
  };
}

const ZERO: SimulationDelta = { leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 };

export function simulateReallocation(input: SimulationInput): SimulationResult {
  const elasticity = input.elasticity ?? 0.8;
  const notes: string[] = [];
  if (input.sources.length === 0 || input.targets.length === 0 || input.amount <= 0) {
    return {
      estimated: true,
      amount: input.amount,
      windowDays: input.windowDays,
      removed: ZERO,
      added: ZERO,
      net: ZERO,
      confidence: 0,
      confidenceLabel: "Low",
      notes: ["Nothing to simulate."],
    };
  }

  // Remove budget proportionally from sources (capped at each source's window spend).
  const sourceSpend = input.sources.reduce((s, r) => s + r.totals.spend, 0) || 1;
  let removed = ZERO;
  let actuallyRemoved = 0;
  for (const src of input.sources) {
    const share = Math.min(src.totals.spend, (input.amount * src.totals.spend) / sourceSpend);
    actuallyRemoved += share;
    removed = add(removed, scale(perDollar(src.totals), share));
  }
  if (actuallyRemoved < input.amount) notes.push("Requested amount exceeds source spend; capped at available spend.");

  // Add budget to targets, weighted by quality, with diminishing returns.
  const weightSum = input.targets.reduce((s, t) => s + Math.max(t.qualityScore, 1), 0) || 1;
  let added = ZERO;
  for (const tgt of input.targets) {
    const share = (actuallyRemoved * Math.max(tgt.qualityScore, 1)) / weightSum;
    const base = tgt.totals.spend > 0 ? tgt.totals.spend : share;
    // Effective new spend after diminishing returns: base * ((base+share)/base)^e
    const effective = base * Math.pow((base + share) / base, elasticity) - base;
    added = add(added, scale(perDollar(tgt.totals), effective));
  }

  const net: SimulationDelta = {
    leads: added.leads - removed.leads,
    mqls: added.mqls - removed.mqls,
    sqls: added.sqls - removed.sqls,
    opportunities: added.opportunities - removed.opportunities,
    pipeline: added.pipeline - removed.pipeline,
    revenue: added.revenue - removed.revenue,
  };

  // Confidence: more SQL evidence + smaller moves relative to target spend → higher.
  const targetSqls = input.targets.reduce((s, t) => s + t.totals.sqls, 0);
  const targetSpend = input.targets.reduce((s, t) => s + t.totals.spend, 0) || 1;
  const moveRatio = actuallyRemoved / targetSpend;
  let confidence = 0.35 + Math.min(0.35, targetSqls / 60) - Math.min(0.3, Math.max(0, moveRatio - 0.25));
  confidence = Math.max(0.1, Math.min(0.9, confidence));
  if (moveRatio > 0.5) notes.push("Large increase relative to current spend — diminishing returns likely.");
  notes.push("Projections are estimates based on trailing unit economics; they are not guarantees.");

  return {
    estimated: true,
    amount: actuallyRemoved,
    windowDays: input.windowDays,
    removed,
    added,
    net,
    confidence,
    confidenceLabel: confidence >= 0.65 ? "High" : confidence >= 0.45 ? "Medium" : "Low",
    notes,
  };
}

/** Convenience: which campaigns can absorb budget well? */
export function absorptionCapacity(c: Campaign, totals: MetricTotals): number {
  const r = funnelRates(totals);
  return (r.mqlToSql ?? 0) * (r.sqlToOpp ?? 0) * c.dailyBudget;
}

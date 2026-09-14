/**
 * Core B2B marketing calculations.
 *
 * Every function is total: division by zero returns `null` (unknown), never
 * Infinity or NaN. Callers decide how to render a null (usually "—").
 */

import type { MetricTotals } from "@/types/domain";

export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Click-through rate: clicks / impressions. */
export const ctr = (clicks: number, impressions: number) => safeDivide(clicks, impressions);

/** Cost per click: spend / clicks. */
export const cpc = (spend: number, clicks: number) => safeDivide(spend, clicks);

/** Cost per lead: spend / leads. */
export const cpl = (spend: number, leads: number) => safeDivide(spend, leads);

/** Cost per MQL: spend / MQLs. */
export const costPerMql = (spend: number, mqls: number) => safeDivide(spend, mqls);

/** Cost per SQL: spend / SQLs. */
export const costPerSql = (spend: number, sqls: number) => safeDivide(spend, sqls);

/** Cost per opportunity: spend / opportunities. */
export const costPerOpportunity = (spend: number, opportunities: number) =>
  safeDivide(spend, opportunities);

/** Revenue ROAS: revenue / spend. */
export const roas = (revenue: number, spend: number) => safeDivide(revenue, spend);

/** Pipeline ROAS: pipeline / spend. */
export const pipelineRoas = (pipeline: number, spend: number) => safeDivide(pipeline, spend);

/** Lead conversion rate: leads / clicks. */
export const leadRate = (leads: number, clicks: number) => safeDivide(leads, clicks);

/** MQL rate: MQLs / leads. */
export const mqlRate = (mqls: number, leads: number) => safeDivide(mqls, leads);

/** SQL rate: SQLs / MQLs. */
export const sqlRate = (sqls: number, mqls: number) => safeDivide(sqls, mqls);

/** Opportunity rate: opportunities / SQLs. */
export const opportunityRate = (opportunities: number, sqls: number) =>
  safeDivide(opportunities, sqls);

/** Revenue per lead: revenue / leads. */
export const revenuePerLead = (revenue: number, leads: number) => safeDivide(revenue, leads);

/** Pipeline per lead: pipeline / leads. */
export const pipelinePerLead = (pipeline: number, leads: number) => safeDivide(pipeline, leads);

/** Lead → SQL rate (end-to-end lead quality): SQLs / leads. */
export const leadToSqlRate = (sqls: number, leads: number) => safeDivide(sqls, leads);

export interface DerivedMetrics {
  ctr: number | null;
  cpc: number | null;
  cpl: number | null;
  costPerMql: number | null;
  costPerSql: number | null;
  costPerOpportunity: number | null;
  roas: number | null;
  pipelineRoas: number | null;
  leadRate: number | null;
  mqlRate: number | null;
  sqlRate: number | null;
  opportunityRate: number | null;
  revenuePerLead: number | null;
  pipelinePerLead: number | null;
  leadToSqlRate: number | null;
}

export function deriveMetrics(t: MetricTotals): DerivedMetrics {
  return {
    ctr: ctr(t.clicks, t.impressions),
    cpc: cpc(t.spend, t.clicks),
    cpl: cpl(t.spend, t.leads),
    costPerMql: costPerMql(t.spend, t.mqls),
    costPerSql: costPerSql(t.spend, t.sqls),
    costPerOpportunity: costPerOpportunity(t.spend, t.opportunities),
    roas: roas(t.revenue, t.spend),
    pipelineRoas: pipelineRoas(t.pipeline, t.spend),
    leadRate: leadRate(t.leads, t.clicks),
    mqlRate: mqlRate(t.mqls, t.leads),
    sqlRate: sqlRate(t.sqls, t.mqls),
    opportunityRate: opportunityRate(t.opportunities, t.sqls),
    revenuePerLead: revenuePerLead(t.revenue, t.leads),
    pipelinePerLead: pipelinePerLead(t.pipeline, t.leads),
    leadToSqlRate: leadToSqlRate(t.sqls, t.leads),
  };
}

export const EMPTY_TOTALS: MetricTotals = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  leads: 0,
  mqls: 0,
  sqls: 0,
  opportunities: 0,
  pipeline: 0,
  revenue: 0,
};

/** Sum a list of metric rows into totals. Frequency is impression-weighted. */
export function sumTotals(rows: Array<Partial<MetricTotals>>): MetricTotals {
  const out: MetricTotals = { ...EMPTY_TOTALS };
  let freqWeighted = 0;
  let freqImpressions = 0;
  for (const r of rows) {
    out.spend += r.spend ?? 0;
    out.impressions += r.impressions ?? 0;
    out.clicks += r.clicks ?? 0;
    out.leads += r.leads ?? 0;
    out.mqls += r.mqls ?? 0;
    out.sqls += r.sqls ?? 0;
    out.opportunities += r.opportunities ?? 0;
    out.pipeline += r.pipeline ?? 0;
    out.revenue += r.revenue ?? 0;
    if (typeof r.frequency === "number" && (r.impressions ?? 0) > 0) {
      freqWeighted += r.frequency * (r.impressions ?? 0);
      freqImpressions += r.impressions ?? 0;
    }
  }
  if (freqImpressions > 0) out.frequency = freqWeighted / freqImpressions;
  return out;
}

/** Relative change between two values; null if the baseline is zero. */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

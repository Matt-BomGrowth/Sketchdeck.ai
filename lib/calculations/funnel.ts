import type { FunnelStage, FunnelStageSummary, MetricTotals } from "@/types/domain";
import { safeDivide } from "./metrics";

export const FUNNEL_STAGES: Array<{ stage: FunnelStage; label: string }> = [
  { stage: "impressions", label: "Impressions" },
  { stage: "clicks", label: "Clicks" },
  { stage: "leads", label: "Leads" },
  { stage: "mqls", label: "MQLs" },
  { stage: "sqls", label: "SQLs" },
  { stage: "opportunities", label: "Opportunities" },
  { stage: "pipeline", label: "Pipeline" },
  { stage: "revenue", label: "Revenue" },
];

/**
 * Build the B2B revenue funnel. Volume-type stages report conversion from the
 * previous stage; monetary stages (pipeline, revenue) report value and the
 * conversion of pipeline → revenue.
 */
export function buildFunnel(t: MetricTotals): FunnelStageSummary[] {
  const volumes: Record<FunnelStage, number> = {
    impressions: t.impressions,
    clicks: t.clicks,
    leads: t.leads,
    mqls: t.mqls,
    sqls: t.sqls,
    opportunities: t.opportunities,
    pipeline: t.pipeline,
    revenue: t.revenue,
  };

  const out: FunnelStageSummary[] = [];
  let prevVolume: number | null = null;
  for (const { stage, label } of FUNNEL_STAGES) {
    const volume = volumes[stage];
    const isMoney = stage === "pipeline" || stage === "revenue";
    let conversion: number | null = null;
    if (stage === "revenue") conversion = safeDivide(t.revenue, t.pipeline);
    else if (stage === "pipeline") conversion = null;
    else if (prevVolume !== null) conversion = safeDivide(volume, prevVolume);

    const costPer = isMoney ? null : safeDivide(t.spend, volume);
    const value = isMoney
      ? volume
      : stage === "opportunities"
        ? t.pipeline
        : null;

    out.push({ stage, label, volume, conversionFromPrevious: conversion, costPer, value });
    if (!isMoney) prevVolume = volume;
  }
  return out;
}

/** Stage-to-stage conversion rates used by simulators and quality scoring. */
export function funnelRates(t: MetricTotals) {
  return {
    clickToLead: safeDivide(t.leads, t.clicks),
    leadToMql: safeDivide(t.mqls, t.leads),
    mqlToSql: safeDivide(t.sqls, t.mqls),
    sqlToOpp: safeDivide(t.opportunities, t.sqls),
    pipelinePerOpp: safeDivide(t.pipeline, t.opportunities),
    winRate: safeDivide(t.revenue, t.pipeline),
  };
}

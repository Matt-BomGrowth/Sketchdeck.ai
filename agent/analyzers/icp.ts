/**
 * ICP Intelligence — "Who actually converts?"
 * Analyzes pipeline concentration by industry, company size, title, seniority, geography
 * and compares spend share vs pipeline share to find over/under-indexing.
 */

import type { AudienceDimension, AudienceSegmentMetric } from "@/types/domain";
import { deriveMetrics } from "@/lib/calculations/metrics";
import { fmtPct } from "@/lib/utils/format";

export interface SegmentRow extends AudienceSegmentMetric {
  spendShare: number;
  pipelineShare: number;
  /** pipelineShare / spendShare — >1 means under-invested relative to results. */
  index: number | null;
  pipelineRoas: number | null;
  costPerSql: number | null;
  sqlRate: number | null;
}

export interface IcpReport {
  byDimension: Record<AudienceDimension, SegmentRow[]>;
  insights: string[];
  recommendations: string[];
}

export const DIMENSION_LABEL: Record<AudienceDimension, string> = {
  industry: "Industry",
  company_size: "Company size",
  job_title: "Job title",
  seniority: "Seniority",
  geography: "Geography",
};

export function analyzeIcp(segments: AudienceSegmentMetric[]): IcpReport {
  const byDimension = {} as Record<AudienceDimension, SegmentRow[]>;
  const insights: string[] = [];
  const recommendations: string[] = [];

  for (const dim of Object.keys(DIMENSION_LABEL) as AudienceDimension[]) {
    const rows = segments.filter((s) => s.dimension === dim);
    const spend = rows.reduce((a, r) => a + r.spend, 0) || 1;
    const pipeline = rows.reduce((a, r) => a + r.pipeline, 0) || 1;
    const enriched: SegmentRow[] = rows
      .map((r) => {
        const m = deriveMetrics(r);
        const spendShare = r.spend / spend;
        const pipelineShare = r.pipeline / pipeline;
        return {
          ...r,
          spendShare,
          pipelineShare,
          index: spendShare > 0 ? pipelineShare / spendShare : null,
          pipelineRoas: m.pipelineRoas,
          costPerSql: m.costPerSql,
          sqlRate: m.sqlRate,
        };
      })
      .sort((a, b) => b.pipeline - a.pipeline);
    byDimension[dim] = enriched;

    // Insight: concentration + over/under-index
    const top = enriched[0];
    if (top && enriched.length > 1) {
      const underInvested = enriched.filter((r) => (r.index ?? 0) >= 1.4 && r.pipelineShare >= 0.15);
      const overInvested = enriched.filter((r) => (r.index ?? 1) <= 0.6 && r.spendShare >= 0.15);
      if (underInvested.length && overInvested.length) {
        const u = underInvested[0];
        const o = overInvested[0];
        insights.push(
          `${fmtPct(u.pipelineShare, 0)} of pipeline comes from ${u.value} (${DIMENSION_LABEL[dim].toLowerCase()}), but current campaigns over-index toward ${o.value} (${fmtPct(o.spendShare, 0)} of spend for ${fmtPct(o.pipelineShare, 0)} of pipeline).`,
        );
        recommendations.push(`Increase ${u.value} targeting; reduce exposure to ${o.value}.`);
      } else if (top.pipelineShare >= 0.5) {
        insights.push(`${top.value} drives ${fmtPct(top.pipelineShare, 0)} of pipeline across ${DIMENSION_LABEL[dim].toLowerCase()} segments.`);
      }
    }
  }

  return { byDimension, insights, recommendations };
}

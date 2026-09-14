import type { CampaignRow } from "@/lib/analytics/snapshot";
import type { CampaignStatus, FatigueStatus, HealthStatus, Platform } from "@/types/domain";

/** Serializable row for the client-side table. */
export interface TableRow {
  id: string;
  name: string;
  platform: Platform;
  status: CampaignStatus;
  country: string;
  industry: string;
  channelType: string;
  dailyBudget: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  leads: number;
  mqls: number;
  sqls: number;
  opportunities: number;
  pipeline: number;
  revenue: number;
  roas: number | null;
  pipelineRoas: number | null;
  cpl: number | null;
  costPerMql: number | null;
  costPerSql: number | null;
  mqlRate: number | null;
  sqlRate: number | null;
  healthScore: number;
  healthStatus: HealthStatus;
  healthLabel: string;
  fatigueScore: number;
  fatigueStatus: FatigueStatus;
  qualityRank: number;
  recommendation?: { id: string; title: string; type: string; priority: string; action: string };
}

export function toTableRows(rows: CampaignRow[]): TableRow[] {
  return rows.map((r) => ({
    id: r.campaign.id,
    name: r.campaign.name,
    platform: r.campaign.platform,
    status: r.campaign.status,
    country: r.campaign.country,
    industry: r.campaign.industry,
    channelType: r.campaign.channelType,
    dailyBudget: r.campaign.dailyBudget,
    spend: r.totals.spend,
    impressions: r.totals.impressions,
    clicks: r.totals.clicks,
    ctr: r.metrics.ctr,
    cpc: r.metrics.cpc,
    leads: r.totals.leads,
    mqls: r.totals.mqls,
    sqls: r.totals.sqls,
    opportunities: r.totals.opportunities,
    pipeline: r.totals.pipeline,
    revenue: r.totals.revenue,
    roas: r.metrics.roas,
    pipelineRoas: r.metrics.pipelineRoas,
    cpl: r.metrics.cpl,
    costPerMql: r.metrics.costPerMql,
    costPerSql: r.metrics.costPerSql,
    mqlRate: r.metrics.mqlRate,
    sqlRate: r.metrics.sqlRate,
    healthScore: r.health.score,
    healthStatus: r.health.status,
    healthLabel: r.health.label,
    fatigueScore: r.fatigue.score,
    fatigueStatus: r.fatigue.status,
    qualityRank: r.qualityRank,
    recommendation: r.recommendation
      ? { id: r.recommendation.id, title: r.recommendation.title, type: r.recommendation.type, priority: r.recommendation.priority, action: r.recommendation.recommendedAction }
      : undefined,
  }));
}

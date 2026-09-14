/**
 * The analysis snapshot: one function that runs the full AdPilot analysis
 * for a date window against any data source (demo or live). Pages and jobs
 * consume this instead of re-implementing analytics.
 */

import type {
  AudienceSegmentMetric,
  AutomationPolicy,
  Campaign,
  Creative,
  CreativeDailyMetric,
  DailyMetric,
  FatigueThresholds,
  MetricTotals,
  Organization,
  Platform,
  Recommendation,
} from "@/types/domain";
import { previousWindow, windowEnding, type DateWindow } from "@/lib/utils/dates";
import { dailySeries, totalsByCampaign, totalsByPlatform, totalsForWindow } from "@/lib/analytics/aggregate";
import { deriveMetrics, pctChange, EMPTY_TOTALS } from "@/lib/calculations/metrics";
import { buildFunnel } from "@/lib/calculations/funnel";
import { computeHealthScore } from "@/agent/analyzers/health-score";
import { assessFatigue, DEFAULT_FATIGUE_THRESHOLDS } from "@/agent/detectors/fatigue";
import { detectAnomalies } from "@/agent/detectors/anomaly";
import { buildBudgetPlan, rankCampaigns } from "@/agent/optimizers/budget-optimizer";
import { generateRecommendations, resetRecommendationIds, type CampaignAssessment } from "@/agent/recommendations/next-best-action";
import { buildExecutiveSummary } from "@/agent/recommendations/executive-summary";
import { explainChange } from "@/agent/analyzers/why-changed";
import { analyzeLeadQuality } from "@/agent/analyzers/lead-quality";
import { analyzeIcp } from "@/agent/analyzers/icp";
import { analyzeCreatives } from "@/agent/analyzers/creative-pipeline";
import { DEFAULT_AUTOMATION_POLICY } from "@/agent/actions/policy";

export interface SnapshotInput {
  organization: Organization;
  campaigns: Campaign[];
  dailyMetrics: DailyMetric[];
  creatives: Creative[];
  creativeDailyMetrics: CreativeDailyMetric[];
  audienceSegments: AudienceSegmentMetric[];
  endDate: string;
  windowDays: number;
  fatigueThresholds?: FatigueThresholds;
  policy?: AutomationPolicy;
  now?: Date;
}

export interface CampaignRow extends CampaignAssessment {
  metrics: ReturnType<typeof deriveMetrics>;
  qualityRank: number;
  recommendation?: Recommendation;
}

export type AnalysisSnapshot = ReturnType<typeof buildSnapshot>;

export function buildSnapshot(input: SnapshotInput) {
  const now = input.now ?? new Date();
  const thresholds = input.fatigueThresholds ?? DEFAULT_FATIGUE_THRESHOLDS;
  const policy = input.policy ?? DEFAULT_AUTOMATION_POLICY;
  const window: DateWindow = windowEnding(input.endDate, input.windowDays, `last ${input.windowDays} days`);
  const prev = previousWindow(window);
  // B2B pipeline is lumpy day to day, so the default "why did it change" view
  // compares the last 7 days with the 7 before; the selected window is also explained.
  const lastWeek = windowEnding(input.endDate, 7, "the last 7 days");
  const weekBefore = windowEnding(previousWindow(lastWeek).end, 7, "the previous 7 days");

  const totals = totalsForWindow(input.dailyMetrics, window);
  const previousTotals = totalsForWindow(input.dailyMetrics, prev);
  const byCampaign = totalsByCampaign(input.dailyMetrics, window);
  const byCampaignPrev = totalsByCampaign(input.dailyMetrics, prev);
  const byPlatform = totalsByPlatform(input.campaigns, input.dailyMetrics, window);
  const byPlatformPrev = totalsByPlatform(input.campaigns, input.dailyMetrics, prev);

  const seriesByCampaign = new Map<string, DailyMetric[]>();
  for (const m of input.dailyMetrics) {
    const list = seriesByCampaign.get(m.campaignId) ?? [];
    list.push(m);
    seriesByCampaign.set(m.campaignId, list);
  }

  const assessments: CampaignAssessment[] = input.campaigns.map((campaign) => {
    const t = byCampaign.get(campaign.id) ?? { ...EMPTY_TOTALS };
    const p = byCampaignPrev.get(campaign.id) ?? { ...EMPTY_TOTALS };
    const series = (seriesByCampaign.get(campaign.id) ?? []).filter((r) => r.date <= input.endDate);
    const isPaidSocial = campaign.platform !== "google" || campaign.channelType !== "Search";
    const fatigue = campaign.status === "active" ? assessFatigue(series, thresholds, { isPaidSocial }) : { score: 0, status: "healthy" as const, signals: [], reasons: ["Campaign is not active."] };
    const health = computeHealthScore(t, {
      benchmark: totals,
      impressionTrend: pctChange(t.impressions, p.impressions),
      historicalPipelineRoas: deriveMetrics(p).pipelineRoas,
      frequency: t.frequency,
    });
    const anomalies = campaign.status === "active" ? detectAnomalies(series) : [];
    return { campaign, totals: t, previous: p, health, fatigue, anomalies };
  });

  const ranked = rankCampaigns(assessments.map((a) => ({ campaign: a.campaign, totals: a.totals })), totals);
  const rankOf = new Map(ranked.map((r) => [r.campaign.id, r.rank]));
  const excludeFromTop = new Set(assessments.filter((a) => a.fatigue.status === "critical").map((a) => a.campaign.id));
  const plan = buildBudgetPlan(assessments.map((a) => ({ campaign: a.campaign, totals: a.totals })), totals, { horizonDays: 30, excludeFromTop });

  resetRecommendationIds();
  const recommendations = generateRecommendations(assessments, plan, {
    organizationId: input.organization.id,
    benchmark: totals,
    windowDays: input.windowDays,
    policy,
    now,
  });

  const campaignRows: CampaignRow[] = assessments.map((a) => ({
    ...a,
    metrics: deriveMetrics(a.totals),
    qualityRank: rankOf.get(a.campaign.id) ?? 0,
    recommendation: recommendations.find((r) => r.campaignId === a.campaign.id),
  }));

  const fatigueByCampaign = new Map(assessments.map((a) => [a.campaign.id, a.fatigue]));
  const summary = buildExecutiveSummary({ windowLabel: window.label, current: totals, previous: previousTotals, byPlatform, assessments, plan, recommendations });
  const whyChanged = explainChange(input.campaigns, input.dailyMetrics, lastWeek, weekBefore, { fatigueByCampaign });
  const whyChangedWindow = explainChange(input.campaigns, input.dailyMetrics, window, prev, { fatigueByCampaign });
  const leadQuality = analyzeLeadQuality(byPlatform);
  const icp = analyzeIcp(input.audienceSegments);
  const creatives = analyzeCreatives(input.creatives, input.creativeDailyMetrics, window, thresholds);

  const activeAssessments = assessments.filter((a) => a.campaign.status === "active");
  // Triage: critical = act now (creative fatigue, high-severity anomalies);
  // warnings = budget-quality problems (poor health) and early fatigue.
  const alerts = {
    critical: activeAssessments.filter((a) => a.fatigue.status === "critical" || a.anomalies.some((x) => x.severity === "high")).length,
    warnings: activeAssessments.filter((a) => a.fatigue.status !== "critical" && (a.fatigue.status === "warning" || a.health.status === "critical" || a.health.status === "at_risk")).length,
    anomalies: activeAssessments.reduce((s, a) => s + a.anomalies.length, 0),
  };

  const series = dailySeries(input.dailyMetrics, windowEnding(input.endDate, Math.max(input.windowDays, 30)));
  const platformSeries = {} as Record<Platform, ReturnType<typeof dailySeries>>;
  for (const p of ["google", "meta", "linkedin"] as Platform[]) {
    const ids = new Set(input.campaigns.filter((c) => c.platform === p).map((c) => c.id));
    platformSeries[p] = dailySeries(input.dailyMetrics, window, ids);
  }

  return {
    organization: input.organization,
    window,
    previousWindow: prev,
    endDate: input.endDate,
    totals,
    previousTotals,
    derived: deriveMetrics(totals),
    previousDerived: deriveMetrics(previousTotals),
    byPlatform,
    byPlatformPrev,
    funnel: buildFunnel(totals),
    campaigns: campaignRows,
    ranked,
    plan,
    recommendations,
    summary,
    whyChanged,
    whyChangedWindow,
    leadQuality,
    icp,
    creatives,
    alerts,
    series,
    platformSeries,
    policy,
    thresholds,
  };
}

export function totalsOrEmpty(t?: MetricTotals): MetricTotals {
  return t ?? { ...EMPTY_TOTALS };
}

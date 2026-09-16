/**
 * AdPilot AI — core domain types.
 *
 * Everything in the product is expressed against this normalized model so that
 * Google, Meta, LinkedIn (and CRM data from HubSpot) can be analyzed together.
 *
 * The core B2B funnel:
 *   Ad Spend → Lead → MQL → SQL → Opportunity → Pipeline → Revenue
 */

export type Platform = "google" | "meta" | "linkedin";

export type DataMode = "demo" | "live";

export type CampaignStatus = "active" | "paused" | "ended" | "draft";

export type CampaignObjective = "lead_gen" | "demo_requests" | "brand" | "retargeting" | "awareness" | "competitor_conquest";

/** How a campaign was designed to perform. Used only by the demo engine. */
export type PerformanceProfile =
  "high_performing" | "average" | "underperforming" | "fatiguing" | "high_ctr_poor_quality" | "low_ctr_excellent_pipeline" | "high_cpl_excellent_sql";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
}

export interface Campaign {
  id: string;
  organizationId: string;
  platform: Platform;
  externalId: string;
  name: string;
  status: CampaignStatus;
  objective: CampaignObjective;
  /** Daily budget in account currency. */
  dailyBudget: number;
  currency: string;
  country: string;
  /** Target industry segment, e.g. "Structural Steel Fabrication". */
  industry: string;
  /** ICP segment label, e.g. "Chief Estimators". */
  icpSegment: string;
  channelType: string;
  startedAt: string;
  /** Demo-only annotation; never present for live campaigns. */
  profile?: PerformanceProfile;
}

export interface AdGroup {
  id: string;
  campaignId: string;
  externalId: string;
  name: string;
  status: CampaignStatus;
}

/** A single day of normalized performance for one campaign. */
export interface DailyMetric {
  campaignId: string;
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  mqls: number;
  sqls: number;
  opportunities: number;
  pipeline: number;
  revenue: number;
  /** Average frequency (Meta/LinkedIn); undefined for search. */
  frequency?: number;
}

/** Aggregated metrics for any entity over a window. */
export interface MetricTotals {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  mqls: number;
  sqls: number;
  opportunities: number;
  pipeline: number;
  revenue: number;
  frequency?: number;
}

export type CreativeType = "text" | "image" | "video" | "carousel" | "document";

export type CreativeAssetStatus =
  | "asset" // full media asset URL available
  | "preview" // only a platform preview URL is available
  | "unavailable" // no media accessible through current permissions
  | "demo"; // demo-mode creative; intentionally no asset

export interface Creative {
  id: string;
  campaignId: string;
  adGroupId?: string;
  platform: Platform;
  externalId: string;
  name: string;
  type: CreativeType;
  status: CampaignStatus;
  headline: string;
  primaryText: string;
  description?: string;
  cta?: string;
  landingUrl?: string;
  assetStatus: CreativeAssetStatus;
  assetUrl?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  /** Optional A/B test grouping. */
  testGroup?: string;
  variant?: "A" | "B" | "C";
  /** Search ads: every headline / description asset (RSA), when the platform supplies them. */
  headlines?: string[];
  descriptions?: string[];
  adGroupName?: string;
}

export interface CreativeDailyMetric extends Omit<DailyMetric, "campaignId"> {
  creativeId: string;
}

export type AudienceDimension = "industry" | "company_size" | "job_title" | "seniority" | "geography";

export interface AudienceSegmentMetric extends MetricTotals {
  dimension: AudienceDimension;
  value: string;
}

export type FunnelStage = "impressions" | "clicks" | "leads" | "mqls" | "sqls" | "opportunities" | "pipeline" | "revenue";

export interface FunnelStageSummary {
  stage: FunnelStage;
  label: string;
  volume: number;
  /** Conversion from the previous stage, 0..1. */
  conversionFromPrevious: number | null;
  /** Cost per unit at this stage. */
  costPer: number | null;
  /** Monetary value at this stage where meaningful. */
  value: number | null;
}

export type HealthStatus = "healthy" | "watch" | "at_risk" | "critical";

export interface HealthScore {
  score: number; // 0..100
  status: HealthStatus;
  label: string;
  /** Contribution of each component, for explainability. */
  components: Array<{ key: string; label: string; score: number; weight: number }>;
}

export type FatigueStatus = "healthy" | "warning" | "critical";

export interface FatigueSignal {
  key: string;
  label: string;
  current: number;
  baseline: number;
  /** Relative change vs baseline, e.g. -0.18 for an 18% decline. */
  change: number;
  direction: "better" | "worse" | "flat";
}

export interface FatigueAssessment {
  score: number; // 0..100 (higher = more fatigued)
  status: FatigueStatus;
  signals: FatigueSignal[];
  reasons: string[];
}

export interface FatigueThresholds {
  criticalCtr: number; // e.g. 0.015
  warningCtrBand: number; // e.g. 0.004 → warn when CTR < critical + band
  deteriorationPct: number; // e.g. 0.15 → 15% deterioration over window
  lookbackDays: number; // e.g. 2 (approx. 48 hours)
  baselineDays: number; // e.g. 14
  maxFrequency: number; // e.g. 4
  /** Below these recent-window volumes, fatigue is never reported as critical. */
  minRecentImpressions: number; // e.g. 400
  minRecentClicks: number; // e.g. 12
}

export type RecommendationType =
  "budget_increase" | "budget_decrease" | "pause_campaign" | "rotate_creative" | "audience_shift" | "bid_adjustment" | "investigate";

export type RecommendationStatus = "pending" | "approved" | "modified" | "rejected" | "executed" | "measured";

export interface ExpectedImpact {
  pipelineLow: number;
  pipelineHigh: number;
  sqls?: number;
  mqls?: number;
  wasteAvoided?: number;
}

export interface Recommendation {
  id: string;
  organizationId: string;
  campaignId?: string;
  creativeId?: string;
  platform?: Platform;
  type: RecommendationType;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  whatHappened: string;
  why: string;
  recommendedAction: string;
  expectedImpact: ExpectedImpact;
  confidence: number; // 0..1
  status: RecommendationStatus;
  budgetChange?: { from: number; to: number; unit: "per_day" };
  requiresApproval: boolean;
  createdAt: string;
  scanRunId?: string;
}

export type ActionStatus = "pending_approval" | "approved" | "executing" | "executed" | "failed" | "rejected" | "measured";

export interface OptimizationAction {
  id: string;
  organizationId: string;
  recommendationId?: string;
  platform: Platform;
  campaignId: string;
  campaignName: string;
  actionType: RecommendationType;
  before: string;
  after: string;
  reason: string;
  expectedImpact: string;
  actualImpact?: string;
  approver?: string;
  status: ActionStatus;
  createdAt: string;
  executedAt?: string;
  measuredAt?: string;
}

export interface ScanRun {
  id: string;
  organizationId: string;
  startedAt: string;
  finishedAt?: string;
  platformsScanned: Platform[];
  campaignsScanned: number;
  issuesDetected: number;
  recommendationsCreated: number;
  actionsExecuted: number;
  errors: string[];
  status: "running" | "completed" | "failed" | "partial";
}

export interface DailyBrief {
  id: string;
  organizationId: string;
  date: string;
  subject: string;
  summaryMarkdown: string;
  emailHtml: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  actor: string;
  action: string;
  entityType: string;
  entityId?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export type IntegrationKey = "notfair" | "google_ads" | "meta" | "linkedin" | "hubspot" | "ga4" | "search_console";

export type IntegrationHealth = "connected" | "connection_issue" | "not_configured" | "demo";

export interface IntegrationStatus {
  key: IntegrationKey;
  name: string;
  health: IntegrationHealth;
  detail: string;
  lastSyncAt?: string;
  capabilities?: string[];
}

export interface AutomationPolicy {
  /** Maximum percentage change to any budget in one action (0.10 = 10%). */
  maxBudgetChangePct: number;
  /** Maximum total daily budget exposure the agent may move without approval. */
  maxDailyExposure: number;
  /** Any single action moving more than this requires approval. */
  approvalRequiredAbove: number;
  /** Master switch: when false every real action requires approval. */
  autoExecuteEnabled: boolean;
}

// ───────────────────────── Channel detail (redesign) ─────────────────────────

export type KeywordMatchType = "EXACT" | "PHRASE" | "BROAD" | "UNSPECIFIED";

/** One day of a Google Ads keyword (ad group criterion). */
export interface KeywordDailyMetric {
  campaignId: string;
  adGroupExternalId: string;
  adGroupName: string;
  adGroupStatus: CampaignStatus;
  externalId: string;
  keywordText: string;
  matchType: KeywordMatchType;
  status: CampaignStatus;
  qualityScore?: number;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  topImpressionPct?: number;
  searchImpressionShare?: number;
}

export type SearchTermStatus = "ADDED" | "EXCLUDED" | "ADDED_EXCLUDED" | "NONE" | "UNKNOWN";

/** One day of a Google Ads search term (what people actually typed). */
export interface SearchTermDailyMetric {
  campaignId: string;
  adGroupExternalId: string;
  adGroupName: string;
  searchTerm: string;
  status: SearchTermStatus;
  keywordText: string;
  matchType: KeywordMatchType;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
}

export type Ga4Dimension = "channel" | "landing_page" | "key_event";

/**
 * One GA4 day for one dimension value. For `key_event`, `value` is the
 * default channel group and `subValue` the event name.
 */
export interface Ga4DailyMetric {
  date: string;
  dimension: Ga4Dimension;
  value: string;
  subValue: string;
  sessions: number;
  users: number;
  newUsers: number;
  engagedSessions: number;
  keyEvents: number;
}

export type SearchConsoleDimension = "site" | "query" | "page";

/** One Search Console day for the whole site, a query, or a page. */
export interface SearchConsoleDailyMetric {
  date: string;
  dimension: SearchConsoleDimension;
  value: string;
  clicks: number;
  impressions: number;
  /** Average position that day (undefined when there were no impressions). */
  position?: number;
}

export type CrmStage = "lead" | "mql" | "sql" | "opportunity" | "closed_won" | "closed_lost";

/** CRM lifecycle / deal events per day and original traffic source. */
export interface CrmFunnelDailyMetric {
  date: string;
  /** HubSpot original source, e.g. PAID_SEARCH, ORGANIC_SEARCH, DIRECT_TRAFFIC. */
  source: string;
  stage: CrmStage;
  count: number;
  amount: number;
}

import type {
  AudienceSegmentMetric,
  AutomationPolicy,
  Campaign,
  Creative,
  CreativeDailyMetric,
  CrmFunnelDailyMetric,
  DailyBrief,
  DailyMetric,
  DataMode,
  FatigueThresholds,
  Ga4DailyMetric,
  IntegrationStatus,
  KeywordDailyMetric,
  OptimizationAction,
  Organization,
  Recommendation,
  ScanRun,
  SearchConsoleDailyMetric,
  SearchTermDailyMetric,
} from "@/types/domain";
import type { DecisionInput } from "@/agent/actions/approval-workflow";
import type {
  NormalizedCampaign,
  NormalizedCampaignMetric,
  NormalizedCreative,
  NormalizedCreativeMetric,
  NormalizedCrmFunnelDaily,
  NormalizedGa4Daily,
  NormalizedKeywordMetric,
  NormalizedSearchConsoleDaily,
  NormalizedSearchTermMetric,
} from "@/integrations/types";
import type { AttributedFunnelRow } from "@/integrations/attribution";

export interface DateRangeQuery {
  start: string;
  end: string;
}

export interface OrgSettings {
  fatigueThresholds: FatigueThresholds;
  automationPolicy: AutomationPolicy;
}

/**
 * Storage/data-access abstraction. The demo implementation is in-memory and
 * deterministic; the live implementation reads from Supabase (populated by the
 * hourly scan from NotFair and other integrations).
 */
export interface DataRepository {
  readonly mode: DataMode;
  getOrganization(): Promise<Organization>;
  getSettings(): Promise<OrgSettings>;
  saveSettings(settings: OrgSettings): Promise<void>;
  /** Latest complete day of data available (YYYY-MM-DD). */
  getLatestDate(): Promise<string>;
  getCampaigns(): Promise<Campaign[]>;
  getDailyMetrics(range: DateRangeQuery): Promise<DailyMetric[]>;
  getCreatives(): Promise<Creative[]>;
  getCreativeDailyMetrics(range: DateRangeQuery): Promise<CreativeDailyMetric[]>;
  getAudienceSegments(range: DateRangeQuery): Promise<AudienceSegmentMetric[]>;
  /** Channel detail for the redesigned dashboard (Google Ads keywords / search terms, GA4, Search Console, CRM by source). */
  getKeywordDailyMetrics(range: DateRangeQuery): Promise<KeywordDailyMetric[]>;
  getSearchTermDailyMetrics(range: DateRangeQuery): Promise<SearchTermDailyMetric[]>;
  getGa4Daily(range: DateRangeQuery): Promise<Ga4DailyMetric[]>;
  getSearchConsoleDaily(range: DateRangeQuery): Promise<SearchConsoleDailyMetric[]>;
  getCrmFunnelDaily(range: DateRangeQuery): Promise<CrmFunnelDailyMetric[]>;
  getRecommendations(): Promise<Recommendation[]>;
  saveRecommendations(recs: Recommendation[]): Promise<void>;
  decideRecommendation(id: string, input: DecisionInput): Promise<{ recommendation: Recommendation; action?: OptimizationAction }>;
  getActions(): Promise<OptimizationAction[]>;
  saveAction(action: OptimizationAction): Promise<void>;
  getScanRuns(limit?: number): Promise<ScanRun[]>;
  saveScanRun(run: ScanRun): Promise<void>;
  getDailyBriefs(limit?: number): Promise<DailyBrief[]>;
  saveDailyBrief(brief: DailyBrief): Promise<void>;
  getIntegrationStatuses(): Promise<IntegrationStatus[]>;
  saveIntegrationStatus(status: IntegrationStatus): Promise<void>;
  /** Ingestion (used by the hourly scan). Returns a map externalId → internal id. */
  upsertCampaigns(rows: NormalizedCampaign[], source: string): Promise<Map<string, string>>;
  upsertDailyMetrics(rows: NormalizedCampaignMetric[], campaignIds: Map<string, string>, source: string): Promise<number>;
  upsertCreatives(rows: NormalizedCreative[], campaignIds: Map<string, string>, source: string): Promise<Map<string, string>>;
  upsertCreativeDailyMetrics(rows: NormalizedCreativeMetric[], creativeIds: Map<string, string>, source: string): Promise<number>;
  /** Write CRM-attributed funnel counts (leads/MQL/SQL/opps/pipeline/revenue) onto campaign-day rows. */
  applyFunnelAttribution(rows: AttributedFunnelRow[], source: string): Promise<number>;
  upsertKeywordDailyMetrics(rows: NormalizedKeywordMetric[], campaignIds: Map<string, string>, source: string): Promise<number>;
  upsertSearchTermDailyMetrics(rows: NormalizedSearchTermMetric[], campaignIds: Map<string, string>, source: string): Promise<number>;
  upsertGa4Daily(rows: NormalizedGa4Daily[], source: string): Promise<number>;
  upsertSearchConsoleDaily(rows: NormalizedSearchConsoleDaily[], source: string): Promise<number>;
  upsertCrmFunnelDaily(rows: NormalizedCrmFunnelDaily[], provider: string): Promise<number>;
  audit(actor: string, action: string, entityType: string, entityId?: string, details?: Record<string, unknown>): Promise<void>;
}

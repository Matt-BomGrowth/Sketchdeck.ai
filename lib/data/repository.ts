import type {
  AudienceSegmentMetric,
  AutomationPolicy,
  Campaign,
  Creative,
  CreativeDailyMetric,
  DailyBrief,
  DailyMetric,
  DataMode,
  FatigueThresholds,
  IntegrationStatus,
  OptimizationAction,
  Organization,
  Recommendation,
  ScanRun,
} from "@/types/domain";
import type { DecisionInput } from "@/agent/actions/approval-workflow";
import type { NormalizedCampaign, NormalizedCampaignMetric, NormalizedCreative, NormalizedCreativeMetric } from "@/integrations/types";

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
  audit(actor: string, action: string, entityType: string, entityId?: string, details?: Record<string, unknown>): Promise<void>;
}

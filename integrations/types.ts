import type {
  CampaignStatus,
  Creative,
  CrmFunnelDailyMetric,
  DailyMetric,
  Ga4DailyMetric,
  IntegrationKey,
  IntegrationStatus,
  KeywordDailyMetric,
  Platform,
  SearchConsoleDailyMetric,
  SearchTermDailyMetric,
} from "@/types/domain";

/** Campaign as returned by a connector before it is stored. */
export interface NormalizedCampaign {
  platform: Platform;
  externalId: string;
  name: string;
  status: CampaignStatus;
  objective: string;
  dailyBudget: number;
  currency: string;
  channelType: string;
  raw?: unknown;
}

/** Daily metric keyed by the platform's external campaign id. */
export interface NormalizedCampaignMetric extends Omit<DailyMetric, "campaignId"> {
  externalCampaignId: string;
  /** Platform-reported conversions (not MQL/SQL — those come from the CRM). */
  platformConversions?: number;
  platformConversionValue?: number;
}

export interface NormalizedCreative extends Omit<Creative, "id" | "campaignId" | "adGroupId" | "organizationId"> {
  externalCampaignId: string;
  externalAdGroupId?: string;
  assetId?: string;
  raw?: unknown;
}

export interface NormalizedCreativeMetric extends Omit<DailyMetric, "campaignId"> {
  externalCreativeId: string;
}

/** Keyword day keyed by the platform's external campaign id (resolved to a campaign uuid on store). */
export interface NormalizedKeywordMetric extends Omit<KeywordDailyMetric, "campaignId"> {
  externalCampaignId: string;
}

export interface NormalizedSearchTermMetric extends Omit<SearchTermDailyMetric, "campaignId"> {
  externalCampaignId: string;
}

export type NormalizedGa4Daily = Ga4DailyMetric;
export type NormalizedSearchConsoleDaily = SearchConsoleDailyMetric;
export type NormalizedCrmFunnelDaily = CrmFunnelDailyMetric;

export interface DateRange {
  start: string;
  end: string;
}

/**
 * Every integration is an independent module implementing this interface.
 * A connector must never fabricate data: if it is not configured or the
 * upstream call fails, it reports `not_configured` / `connection_issue` and
 * throws from fetch methods so the scan records the error and continues.
 */
export interface Connector {
  key: IntegrationKey;
  name: string;
  /** Advertising platforms this connector can supply (empty for CRM/analytics). */
  platforms: Platform[];
  isConfigured(): boolean;
  checkHealth(): Promise<IntegrationStatus>;
}

export interface AdPlatformConnector extends Connector {
  fetchCampaigns(): Promise<NormalizedCampaign[]>;
  fetchDailyMetrics(range: DateRange): Promise<NormalizedCampaignMetric[]>;
  fetchCreatives(): Promise<NormalizedCreative[]>;
  fetchCreativeDailyMetrics?(range: DateRange): Promise<NormalizedCreativeMetric[]>;
  /** Search platforms only: keyword-level and search-term-level daily metrics. */
  fetchKeywordDailyMetrics?(range: DateRange): Promise<NormalizedKeywordMetric[]>;
  fetchSearchTermDailyMetrics?(range: DateRange): Promise<NormalizedSearchTermMetric[]>;
}

/** Web analytics (GA4) — sessions, users, engagement and key events by channel, landing page and event. */
export interface AnalyticsConnector extends Connector {
  fetchDaily(range: DateRange): Promise<NormalizedGa4Daily[]>;
}

/** Organic search (Search Console) — clicks, impressions and position for the site, queries and pages. */
export interface SearchConnector extends Connector {
  fetchDaily(range: DateRange): Promise<NormalizedSearchConsoleDaily[]>;
}

export interface CrmFunnelEvent {
  externalContactId: string;
  email?: string;
  stage: "lead" | "mql" | "sql" | "opportunity" | "closed_won" | "closed_lost";
  occurredAt: string;
  amount?: number;
  campaignName?: string;
  source?: string;
  /** HubSpot "Original Traffic Source Drill-Down 1" — for PAID_SOCIAL this is the network (e.g. "linkedin"). */
  sourceDetail?: string;
  jobTitle?: string;
  companySize?: string;
  industry?: string;
  country?: string;
  /** Paid click ids captured by HubSpot (gclid / fbclid / li_fat_id) for deterministic attribution. */
  clickIds?: { google?: string; meta?: string; linkedin?: string };
}

export interface CrmConnector extends Connector {
  fetchFunnelEvents(range: DateRange): Promise<CrmFunnelEvent[]>;
}

export function notConfigured(key: IntegrationKey, name: string, detail: string): IntegrationStatus {
  return { key, name, health: "not_configured", detail };
}

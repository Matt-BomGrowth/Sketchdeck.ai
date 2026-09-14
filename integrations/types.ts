import type { CampaignStatus, Creative, DailyMetric, IntegrationKey, IntegrationStatus, Platform } from "@/types/domain";

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
}

export interface CrmFunnelEvent {
  externalContactId: string;
  email?: string;
  stage: "lead" | "mql" | "sql" | "opportunity" | "closed_won" | "closed_lost";
  occurredAt: string;
  amount?: number;
  campaignName?: string;
  source?: string;
  jobTitle?: string;
  companySize?: string;
  industry?: string;
  country?: string;
}

export interface CrmConnector extends Connector {
  fetchFunnelEvents(range: DateRange): Promise<CrmFunnelEvent[]>;
}

export function notConfigured(key: IntegrationKey, name: string, detail: string): IntegrationStatus {
  return { key, name, health: "not_configured", detail };
}

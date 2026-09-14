import type { IntegrationStatus } from "@/types/domain";
import type { AdPlatformConnector, DateRange, NormalizedCampaign, NormalizedCampaignMetric, NormalizedCreative, NormalizedCreativeMetric } from "@/integrations/types";
import { NotFairClient, NotFairError, getNotFairClient } from "./client";
import { READ } from "./capabilities";
import { campaignInventoryScript, creativesScript, dailyAdMetricsScript, dailyCampaignMetricsScript } from "./gaql";
import { normalizeAdDailyMetrics, normalizeCampaigns, normalizeCreatives, normalizeDailyMetrics } from "./normalize";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Google Ads via NotFair MCP. This is AdPilot's primary live ad-platform
 * source for SketchDeck. Every method fails loudly (throws) rather than
 * returning fabricated rows.
 */
export class NotFairGoogleAdsConnector implements AdPlatformConnector {
  key = "notfair" as const;
  name = "NotFair MCP · Google Ads";
  platforms = ["google" as const];

  constructor(private readonly client: NotFairClient = getNotFairClient(), private readonly accountId = process.env.NOTFAIR_GOOGLE_ADS_ACCOUNT_ID) {}

  isConfigured() {
    return this.client.isConfigured();
  }

  async checkHealth(): Promise<IntegrationStatus> {
    if (!this.isConfigured()) {
      return { key: this.key, name: this.name, health: "not_configured", detail: "Set NOTFAIR_MCP_URL (and NOTFAIR_API_KEY) to connect the NotFair MCP server." };
    }
    try {
      const res = await this.client.executeRead<{ accounts: Array<{ id: string; name: string }>; oauthIdentity?: string }>(READ.listConnectedAccounts);
      const accounts = res.accounts ?? [];
      return {
        key: this.key,
        name: this.name,
        health: accounts.length ? "connected" : "connection_issue",
        detail: accounts.length ? `Connected: ${accounts.map((a) => `${a.name} (${a.id})`).join(", ")}` : "No Google Ads accounts connected in NotFair.",
        lastSyncAt: new Date().toISOString(),
        capabilities: Object.values(READ).map((c) => c.id),
      };
    } catch (err) {
      return { key: this.key, name: this.name, health: "connection_issue", detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async fetchCampaigns(): Promise<NormalizedCampaign[]> {
    const res = await this.client.runGoogleAdsScript<{ campaigns: any[]; customer: any; errors: Record<string, unknown> }>(campaignInventoryScript(), { accountId: this.accountId });
    if (res.errors?.campaigns) throw new NotFairError("Campaign query failed", "gaql", res.errors.campaigns);
    return normalizeCampaigns(res.campaigns, res.customer?.customer?.currency_code ?? "USD");
  }

  async fetchDailyMetrics(range: DateRange): Promise<NormalizedCampaignMetric[]> {
    const res = await this.client.runGoogleAdsScript<{ rows: any[]; truncated: boolean }>(dailyCampaignMetricsScript(range.start, range.end), { accountId: this.accountId });
    if (res.truncated) throw new NotFairError("Daily metrics response truncated; narrow the date range.", "truncated");
    return normalizeDailyMetrics(res.rows);
  }

  async fetchCreatives(): Promise<NormalizedCreative[]> {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 30);
    const res = await this.client.runGoogleAdsScript<Record<string, { rows: any[]; error?: unknown }>>(creativesScript(iso(start), iso(end)), { accountId: this.accountId });
    if (res.ads?.error) throw new NotFairError("Ad query failed", "gaql", res.ads.error);
    return normalizeCreatives({ ads: res.ads?.rows ?? [], imageAssets: res.imageAssets?.rows ?? [], videoAssets: res.videoAssets?.rows ?? [], campaignImageLinks: res.campaignImageLinks?.rows ?? [] });
  }

  async fetchCreativeDailyMetrics(range: DateRange): Promise<NormalizedCreativeMetric[]> {
    const res = await this.client.runGoogleAdsScript<{ rows: any[]; truncated: boolean }>(dailyAdMetricsScript(range.start, range.end), { accountId: this.accountId });
    if (res.truncated) throw new NotFairError("Ad metrics response truncated; narrow the date range.", "truncated");
    return normalizeAdDailyMetrics(res.rows);
  }
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

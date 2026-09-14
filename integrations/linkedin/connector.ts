import type { IntegrationStatus } from "@/types/domain";
import type { AdPlatformConnector, DateRange, NormalizedCampaign, NormalizedCampaignMetric, NormalizedCreative } from "@/integrations/types";

/**
 * LinkedIn Marketing API connector.
 *
 * LinkedIn's Marketing Developer Platform requires an approved application
 * and OAuth 2.0 (r_ads, r_ads_reporting). Until an access token is provided
 * this connector reports `not_configured`. The health check calls the
 * documented `/rest/adAccounts` endpoint. Campaign/metric fetches are
 * implemented against the documented endpoints but NOT verified live.
 *
 * LinkedIn campaign names are visible today in GA4 (utm_source=linkedin) via
 * NotFair — AdPilot uses that for session/lead attribution until this
 * connector is authorized.
 */
const BASE = "https://api.linkedin.com/rest";
const VERSION = "202409";

export class LinkedInAdsConnector implements AdPlatformConnector {
  key = "linkedin" as const;
  name = "LinkedIn Ads";
  platforms = ["linkedin" as const];

  constructor(private readonly token = process.env.LINKEDIN_ACCESS_TOKEN, private readonly accountId = process.env.LINKEDIN_AD_ACCOUNT_ID) {}

  isConfigured() {
    return Boolean(this.token && this.accountId);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${this.token}`, "LinkedIn-Version": VERSION, "X-Restli-Protocol-Version": "2.0.0" } });
    if (!res.ok) throw new Error(`LinkedIn ${path} → ${res.status}`);
    return (await res.json()) as T;
  }

  async checkHealth(): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return { key: this.key, name: this.name, health: "not_configured", detail: "Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_AD_ACCOUNT_ID (Marketing Developer Platform access required)." };
    try {
      await this.get(`/adAccounts/${this.accountId}`);
      return { key: this.key, name: this.name, health: "connected", detail: `Ad account ${this.accountId} reachable.`, lastSyncAt: new Date().toISOString() };
    } catch (err) {
      return { key: this.key, name: this.name, health: "connection_issue", detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async fetchCampaigns(): Promise<NormalizedCampaign[]> {
    const r = await this.get<{ elements: Array<{ id: number; name: string; status: string; objectiveType?: string; dailyBudget?: { amount: string; currencyCode: string } }> }>(`/adAccounts/${this.accountId}/adCampaigns?q=search&pageSize=200`);
    return r.elements.map((c) => ({
      platform: "linkedin",
      externalId: String(c.id),
      name: c.name,
      status: c.status === "ACTIVE" ? "active" : c.status === "PAUSED" ? "paused" : "ended",
      objective: (c.objectiveType ?? "lead_generation").toLowerCase(),
      dailyBudget: c.dailyBudget ? Number(c.dailyBudget.amount) : 0,
      currency: c.dailyBudget?.currencyCode ?? "USD",
      channelType: "Sponsored Content",
      raw: c,
    }));
  }

  async fetchDailyMetrics(range: DateRange): Promise<NormalizedCampaignMetric[]> {
    const [sy, sm, sd] = range.start.split("-").map(Number);
    const [ey, em, ed] = range.end.split("-").map(Number);
    const dr = `(start:(year:${sy},month:${sm},day:${sd}),end:(year:${ey},month:${em},day:${ed}))`;
    const r = await this.get<{ elements: Array<{ pivotValues: string[]; dateRange: { start: { year: number; month: number; day: number } }; costInLocalCurrency: string; impressions: number; clicks: number; oneClickLeads?: number; externalWebsiteConversions?: number }> }>(
      `/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY&dateRange=${dr}&accounts=List(urn%3Ali%3AsponsoredAccount%3A${this.accountId})&fields=pivotValues,dateRange,costInLocalCurrency,impressions,clicks,oneClickLeads,externalWebsiteConversions`,
    );
    return r.elements.map((e) => {
      const d = e.dateRange.start;
      const leads = (e.oneClickLeads ?? 0) + (e.externalWebsiteConversions ?? 0);
      return {
        externalCampaignId: (e.pivotValues[0] ?? "").split(":").pop() ?? "",
        date: `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
        spend: Number(e.costInLocalCurrency ?? 0),
        impressions: e.impressions ?? 0,
        clicks: e.clicks ?? 0,
        leads,
        mqls: 0,
        sqls: 0,
        opportunities: 0,
        pipeline: 0,
        revenue: 0,
        platformConversions: leads,
      };
    });
  }

  async fetchCreatives(): Promise<NormalizedCreative[]> {
    // Creative content on LinkedIn requires resolving Posts/Share URNs; not implemented until authorized.
    throw new Error("LinkedIn creative fetch is not implemented until Marketing Developer Platform access is authorized.");
  }
}

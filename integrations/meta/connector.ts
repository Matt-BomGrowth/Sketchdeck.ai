import type { IntegrationStatus } from "@/types/domain";
import type { AdPlatformConnector, DateRange, NormalizedCampaign, NormalizedCampaignMetric, NormalizedCreative } from "@/integrations/types";
import { mapStatus } from "@/integrations/notfair/normalize";

/**
 * Meta Marketing API connector (Graph API v21.0).
 * Status: implemented against the documented endpoints; NOT verified against a
 * live SketchDeck ad account in this environment. Meta is also supported by
 * NotFair but is not connected in the SketchDeck NotFair workspace.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export class MetaAdsConnector implements AdPlatformConnector {
  key = "meta" as const;
  name = "Meta Ads";
  platforms = ["meta" as const];

  constructor(private readonly token = process.env.META_ACCESS_TOKEN, private readonly adAccountId = process.env.META_AD_ACCOUNT_ID) {}

  isConfigured() {
    return Boolean(this.token && this.adAccountId);
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${GRAPH}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", this.token ?? "");
    const res = await fetch(url);
    const json = (await res.json()) as T & { error?: { message: string; code: number } };
    if (!res.ok || json.error) throw new Error(`Meta API ${path}: ${json.error?.message ?? res.status}`);
    return json;
  }

  private get account() {
    const id = this.adAccountId ?? "";
    return id.startsWith("act_") ? id : `act_${id}`;
  }

  async checkHealth(): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return { key: this.key, name: this.name, health: "not_configured", detail: "Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID." };
    try {
      const r = await this.get<{ name: string; account_status: number }>(`/${this.account}`, { fields: "name,account_status" });
      return { key: this.key, name: this.name, health: "connected", detail: `Connected: ${r.name}`, lastSyncAt: new Date().toISOString() };
    } catch (err) {
      return { key: this.key, name: this.name, health: "connection_issue", detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async fetchCampaigns(): Promise<NormalizedCampaign[]> {
    const r = await this.get<{ data: Array<{ id: string; name: string; status: string; objective: string; daily_budget?: string; lifetime_budget?: string }> }>(`/${this.account}/campaigns`, {
      fields: "id,name,status,objective,daily_budget,lifetime_budget",
      limit: "200",
    });
    return r.data.map((c) => ({
      platform: "meta",
      externalId: c.id,
      name: c.name,
      status: mapStatus(c.status === "ACTIVE" ? "ENABLED" : c.status),
      objective: c.objective?.toLowerCase() ?? "lead_gen",
      dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : 0,
      currency: "USD",
      channelType: "Paid Social",
      raw: c,
    }));
  }

  async fetchDailyMetrics(range: DateRange): Promise<NormalizedCampaignMetric[]> {
    const r = await this.get<{ data: Array<{ campaign_id: string; date_start: string; spend: string; impressions: string; clicks: string; frequency?: string; actions?: Array<{ action_type: string; value: string }> }> }>(`/${this.account}/insights`, {
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since: range.start, until: range.end }),
      fields: "campaign_id,spend,impressions,clicks,frequency,actions",
      limit: "500",
    });
    return r.data.map((row) => {
      const leads = (row.actions ?? []).filter((a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped").reduce((s, a) => s + Number(a.value), 0);
      return {
        externalCampaignId: row.campaign_id,
        date: row.date_start,
        spend: Number(row.spend ?? 0),
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        leads,
        mqls: 0,
        sqls: 0,
        opportunities: 0,
        pipeline: 0,
        revenue: 0,
        frequency: row.frequency ? Number(row.frequency) : undefined,
        platformConversions: leads,
      };
    });
  }

  async fetchCreatives(): Promise<NormalizedCreative[]> {
    const r = await this.get<{ data: Array<{ id: string; name: string; status: string; campaign_id: string; adset_id: string; creative?: { id: string; name?: string; title?: string; body?: string; image_url?: string; thumbnail_url?: string; call_to_action_type?: string; object_story_spec?: { link_data?: { link?: string; message?: string; name?: string } } } }> }>(`/${this.account}/ads`, {
      fields: "id,name,status,campaign_id,adset_id,creative{id,name,title,body,image_url,thumbnail_url,call_to_action_type,object_story_spec}",
      limit: "200",
    });
    return r.data.map((ad) => {
      const c = ad.creative ?? { id: ad.id };
      const img = c.image_url;
      const thumb = c.thumbnail_url;
      return {
        platform: "meta",
        externalId: ad.id,
        externalCampaignId: ad.campaign_id,
        externalAdGroupId: ad.adset_id,
        name: ad.name,
        type: img ? "image" : "text",
        status: mapStatus(ad.status === "ACTIVE" ? "ENABLED" : ad.status),
        headline: c.title ?? c.object_story_spec?.link_data?.name ?? c.name ?? ad.name,
        primaryText: c.body ?? c.object_story_spec?.link_data?.message ?? "",
        cta: c.call_to_action_type,
        landingUrl: c.object_story_spec?.link_data?.link,
        assetStatus: img ? "asset" : thumb ? "preview" : "unavailable",
        assetId: c.id,
        assetUrl: img,
        previewUrl: thumb,
        thumbnailUrl: thumb ?? img,
        raw: ad,
      };
    });
  }
}

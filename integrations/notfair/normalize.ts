/**
 * Normalizers: Google Ads GAQL rows (as returned by NotFair runScript) →
 * AdPilot's platform-neutral model.
 */

import type { CampaignStatus } from "@/types/domain";
import type { NormalizedCampaign, NormalizedCampaignMetric, NormalizedCreative, NormalizedCreativeMetric } from "@/integrations/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function micros(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Math.round((n / 1_000_000) * 100) / 100 : 0;
}

export function mapStatus(name: string | undefined): CampaignStatus {
  switch ((name ?? "").toUpperCase()) {
    case "ENABLED":
      return "active";
    case "PAUSED":
      return "paused";
    case "REMOVED":
      return "ended";
    default:
      return "draft";
  }
}

function channelLabel(name: string | undefined) {
  switch ((name ?? "").toUpperCase()) {
    case "SEARCH":
      return "Search";
    case "DISPLAY":
      return "Display";
    case "PERFORMANCE_MAX":
      return "Performance Max";
    case "DEMAND_GEN":
      return "Demand Gen";
    case "VIDEO":
      return "Video";
    case "SHOPPING":
      return "Shopping";
    default:
      return name ?? "Unknown";
  }
}

export function normalizeCampaigns(rows: Row[], currency = "USD"): NormalizedCampaign[] {
  return rows
    .filter((r) => r.campaign?.id !== undefined)
    .map((r) => ({
      platform: "google" as const,
      externalId: String(r.campaign.id),
      name: String(r.campaign.name ?? r.campaign.id),
      status: mapStatus(r.campaign.status_name),
      objective: /brand/i.test(String(r.campaign.name)) ? "brand" : /compet/i.test(String(r.campaign.name)) ? "competitor_conquest" : "demo_requests",
      dailyBudget: r.campaign_budget?.amount_value ?? micros(r.campaign_budget?.amount_micros),
      currency,
      channelType: channelLabel(r.campaign.advertising_channel_type_name),
      raw: r,
    }));
}

/**
 * Daily campaign metrics. `leads` = platform primary conversions — this is the
 * best available lead proxy from Google Ads; MQL/SQL/pipeline are left at 0
 * for the CRM attribution step to fill in.
 */
export function normalizeDailyMetrics(rows: Row[]): NormalizedCampaignMetric[] {
  return rows
    .filter((r) => r.campaign?.id !== undefined && r.segments?.date)
    .map((r) => {
      const m = r.metrics ?? {};
      const conversions = Number(m.conversions ?? 0);
      return {
        externalCampaignId: String(r.campaign.id),
        date: String(r.segments.date),
        spend: m.cost_value ?? micros(m.cost_micros),
        impressions: Number(m.impressions ?? 0),
        clicks: Number(m.clicks ?? 0),
        leads: Math.round(conversions),
        mqls: 0,
        sqls: 0,
        opportunities: 0,
        pipeline: 0,
        revenue: 0,
        platformConversions: conversions,
        platformConversionValue: Number(m.conversions_value ?? 0),
      };
    });
}

export interface CreativeInput {
  ads: Row[];
  imageAssets?: Row[];
  videoAssets?: Row[];
  campaignImageLinks?: Row[];
}

/**
 * Creatives. Responsive Search Ads become text creatives with the first
 * headline/description; image ads use their real image_url/preview URL. When
 * no media is accessible, assetStatus is "unavailable" — never fabricated.
 */
export function normalizeCreatives(input: CreativeInput): NormalizedCreative[] {
  const imageById = new Map<string, Row>();
  for (const a of input.imageAssets ?? []) if (a.asset?.id !== undefined) imageById.set(String(a.asset.id), a.asset);
  const videoById = new Map<string, Row>();
  for (const a of input.videoAssets ?? []) if (a.asset?.id !== undefined) videoById.set(String(a.asset.id), a.asset);

  const out: NormalizedCreative[] = [];
  for (const r of input.ads) {
    const ad = r.ad_group_ad?.ad;
    if (!ad?.id) continue;
    const type = String(ad.type_name ?? "");
    const finalUrl = Array.isArray(ad.final_urls) ? ad.final_urls[0] : undefined;
    const base = {
      platform: "google" as const,
      externalId: String(ad.id),
      externalCampaignId: String(r.campaign?.id ?? ""),
      externalAdGroupId: r.ad_group?.id !== undefined ? String(r.ad_group.id) : undefined,
      status: mapStatus(r.ad_group_ad?.status_name),
      landingUrl: finalUrl,
      raw: r,
    };

    if (type === "RESPONSIVE_SEARCH_AD") {
      const headlines: Row[] = ad.responsive_search_ad?.headlines ?? [];
      const descriptions: Row[] = ad.responsive_search_ad?.descriptions ?? [];
      const best = (list: Row[]) => [...list].sort((a, b) => labelRank(b.asset_performance_label_name) - labelRank(a.asset_performance_label_name))[0];
      const h = best(headlines);
      const d = best(descriptions);
      out.push({
        ...base,
        name: `${r.ad_group?.name ?? "Ad group"} · RSA ${ad.id}`,
        type: "text",
        headline: h?.text ?? "",
        primaryText: d?.text ?? "",
        description: descriptions.map((x) => x.text).filter(Boolean).slice(0, 4).join(" | "),
        cta: undefined,
        assetStatus: "unavailable",
      });
      continue;
    }

    if (type === "IMAGE_AD") {
      const url = ad.image_ad?.image_url;
      const preview = ad.image_ad?.preview_image_url;
      out.push({
        ...base,
        name: ad.name ?? `Image ad ${ad.id}`,
        type: "image",
        headline: ad.name ?? "",
        primaryText: "",
        assetStatus: url ? "asset" : preview ? "preview" : "unavailable",
        assetUrl: url ?? undefined,
        previewUrl: preview ?? undefined,
        thumbnailUrl: preview ?? url ?? undefined,
      });
      continue;
    }

    if (type === "RESPONSIVE_DISPLAY_AD") {
      const images: Row[] = ad.responsive_display_ad?.marketing_images ?? [];
      const assetName: string | undefined = images[0]?.asset;
      const assetId = assetName?.split("/").pop();
      const img = assetId ? imageById.get(assetId) : undefined;
      const url = img?.image_asset?.full_size?.url;
      out.push({
        ...base,
        name: ad.name ?? `Display ad ${ad.id}`,
        type: "image",
        headline: ad.responsive_display_ad?.long_headline?.text ?? ad.responsive_display_ad?.headlines?.[0]?.text ?? "",
        primaryText: ad.responsive_display_ad?.descriptions?.[0]?.text ?? "",
        assetStatus: url ? "asset" : "unavailable",
        assetId,
        assetUrl: url,
        thumbnailUrl: url,
        width: img?.image_asset?.full_size?.width_pixels,
        height: img?.image_asset?.full_size?.height_pixels,
      });
      continue;
    }

    if (type === "VIDEO_AD" || type === "VIDEO_RESPONSIVE_AD") {
      const assetName: string | undefined = ad.video_ad?.video?.asset;
      const assetId = assetName?.split("/").pop();
      const vid = assetId ? videoById.get(assetId) : undefined;
      const ytId = vid?.youtube_video_asset?.youtube_video_id;
      out.push({
        ...base,
        name: ad.name ?? vid?.youtube_video_asset?.youtube_video_title ?? `Video ad ${ad.id}`,
        type: "video",
        headline: vid?.youtube_video_asset?.youtube_video_title ?? "",
        primaryText: "",
        assetStatus: ytId ? "preview" : "unavailable",
        assetId,
        previewUrl: ytId ? `https://www.youtube.com/watch?v=${ytId}` : undefined,
        thumbnailUrl: ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : undefined,
      });
      continue;
    }

    out.push({ ...base, name: ad.name ?? `${type || "Ad"} ${ad.id}`, type: "text", headline: ad.name ?? "", primaryText: "", assetStatus: "unavailable" });
  }
  return out;
}

function labelRank(label: string | undefined) {
  switch ((label ?? "").toUpperCase()) {
    case "BEST":
      return 4;
    case "GOOD":
      return 3;
    case "LEARNING":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}

export function normalizeAdDailyMetrics(rows: Row[]): NormalizedCreativeMetric[] {
  return rows
    .filter((r) => r.ad_group_ad?.ad?.id !== undefined && r.segments?.date)
    .map((r) => {
      const m = r.metrics ?? {};
      return {
        externalCreativeId: String(r.ad_group_ad.ad.id),
        date: String(r.segments.date),
        spend: m.cost_value ?? micros(m.cost_micros),
        impressions: Number(m.impressions ?? 0),
        clicks: Number(m.clicks ?? 0),
        leads: Math.round(Number(m.conversions ?? 0)),
        mqls: 0,
        sqls: 0,
        opportunities: 0,
        pipeline: 0,
        revenue: 0,
      };
    });
}

/** Image assets from the asset library, for the creative gallery. */
export function normalizeImageAssets(rows: Row[]) {
  return rows
    .filter((r) => r.asset?.image_asset?.full_size?.url)
    .map((r) => ({
      assetId: String(r.asset.id),
      name: r.asset.name ?? `Image asset ${r.asset.id}`,
      url: String(r.asset.image_asset.full_size.url),
      width: Number(r.asset.image_asset.full_size.width_pixels ?? 0),
      height: Number(r.asset.image_asset.full_size.height_pixels ?? 0),
      mimeType: String(r.asset.image_asset.mime_type_name ?? ""),
      platform: "google" as const,
    }));
}

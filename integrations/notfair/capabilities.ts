/**
 * NotFair MCP capability inventory — VERIFIED against the live MCP connection
 * on 2026-09-14 (workspace: SketchDeck.AI, Google Ads account 2175229247,
 * GA4 property properties/454640302).
 *
 * The MCP exposes three tools:
 *   search({ query, platform? })            → capability ids + JSON schemas + connected platforms
 *   executeRead({ capabilityId, arguments }) → read-only capability
 *   execute({ capabilityId, arguments })     → write capability (changes live accounts)
 *
 * Only capabilities listed here are used by AdPilot. Anything not verified is
 * not assumed to exist. See docs/integrations/notfair.md for the full audit.
 */

export const NOTFAIR_VERIFIED_AT = "2026-09-14";

export const NOTFAIR_PLATFORMS = [
  "google_ads",
  "meta_ads",
  "x_ads",
  "linkedin_ads",
  "reddit_ads",
  "tiktok_ads",
  "search_console",
  "google_analytics",
  "gohighlevel",
  "wordpress",
] as const;
export type NotFairPlatform = (typeof NOTFAIR_PLATFORMS)[number];

/** Platforms connected in the SketchDeck workspace at verification time. */
export const NOTFAIR_CONNECTED_AT_VERIFICATION: Array<{ platform: NotFairPlatform; primaryAccountId: string }> = [
  { platform: "google_ads", primaryAccountId: "2175229247" },
  { platform: "google_analytics", primaryAccountId: "properties/454640302" },
];

export type Executor = "executeRead" | "execute";

export interface CapabilityDef {
  id: string;
  platform: NotFairPlatform;
  executor: Executor;
  /** What AdPilot uses it for. */
  purpose: string;
  /** true when the capability changes state in the ad account. */
  write: boolean;
}

export const READ = {
  listConnectedAccounts: {
    id: "google_ads_listConnectedAccounts",
    platform: "google_ads",
    executor: "executeRead",
    purpose: "Health check + account discovery (returns accountIds, names, masked OAuth identity).",
    write: false,
  },
  summarizeAccountSetup: {
    id: "google_ads_summarizeAccountSetup",
    platform: "google_ads",
    executor: "executeRead",
    purpose: "Campaign inventory with bidding strategy, budgets, conversion actions, currency and timezone.",
    write: false,
  },
  runScript: {
    id: "google_ads_runScript",
    platform: "google_ads",
    executor: "executeRead",
    purpose: "GAQL reads (campaign/ad/asset/daily metrics) in a sandboxed JS runtime. Primary data path.",
    write: false,
  },
  getChanges: {
    id: "google_ads_getChanges",
    platform: "google_ads",
    executor: "executeRead",
    purpose: "Change log of writes made through NotFair (used to verify executed actions).",
    write: false,
  },
  reviewChangeImpact: {
    id: "google_ads_reviewChangeImpact",
    platform: "google_ads",
    executor: "executeRead",
    purpose: "Before/after correlational impact of recent changes (MEASURE step).",
    write: false,
  },
  getGuardrails: {
    id: "google_ads_getGuardrails",
    platform: "google_ads",
    executor: "executeRead",
    purpose: "Read NotFair guardrails (max budget/bid change %, monthly cap).",
    write: false,
  },
  getAssetLinks: {
    id: "google_ads_getAssetLinks",
    platform: "google_ads",
    executor: "executeRead",
    purpose: "Where an asset (image/video) is linked — campaign/ad group/asset group.",
    write: false,
  },
  ga4RunScript: {
    id: "google_analytics_runScript",
    platform: "google_analytics",
    executor: "executeRead",
    purpose: "GA4 reports: channels, source/medium/campaign, key events (hubspot_form_submit, hubspot_meeting_success).",
    write: false,
  },
  ga4ListProperties: {
    id: "google_analytics_listProperties",
    platform: "google_analytics",
    executor: "executeRead",
    purpose: "GA4 property discovery / health check.",
    write: false,
  },
} as const satisfies Record<string, CapabilityDef>;

/**
 * Write capabilities. Every one of these is gated behind AdPilot's
 * RECOMMEND → APPROVE → EXECUTE workflow; nothing here runs automatically.
 * NotFair additionally enforces its own guardrails (default max budget change 50%).
 */
export const WRITE = {
  updateCampaignBudget: {
    id: "google_ads_updateCampaignBudget",
    platform: "google_ads",
    executor: "execute",
    purpose: "Change a campaign's daily budget (args: campaignId, newDailyBudgetDollars).",
    write: true,
  },
  pauseCampaign: {
    id: "google_ads_pauseCampaign",
    platform: "google_ads",
    executor: "execute",
    purpose: "Pause a campaign (args: campaignId).",
    write: true,
  },
  enableCampaign: {
    id: "google_ads_enableCampaign",
    platform: "google_ads",
    executor: "execute",
    purpose: "Re-enable a paused campaign (args: campaignId).",
    write: true,
  },
  updateAdGroup: {
    id: "google_ads_updateAdGroup",
    platform: "google_ads",
    executor: "execute",
    purpose: "Pause/enable an ad group or adjust its bid/target CPA (args: campaignId, adGroupId, status?, cpcBidDollars?, targetCpaDollars?).",
    write: true,
  },
  setGuardrails: {
    id: "google_ads_setGuardrails",
    platform: "google_ads",
    executor: "execute",
    purpose: "Set NotFair guardrails (maxBudgetChangePct, maxBidChangePct, monthlyCap, targetCpa).",
    write: true,
  },
} as const satisfies Record<string, CapabilityDef>;

/** What the connection can and cannot provide (documented limitations). */
export const NOTFAIR_LIMITATIONS = [
  "Only Google Ads and Google Analytics 4 are connected in the SketchDeck workspace. Meta, LinkedIn, X, Reddit, TikTok and Search Console are supported by NotFair but are NOT connected — AdPilot reports them as not connected rather than fabricating data.",
  "Google Ads creatives are Responsive Search Ads: headlines, descriptions, final URLs and per-asset performance labels are available. No image_ad/video_ad rows exist in the account; image assets exist in the asset library (tpc.googlesyndication.com URLs) and are surfaced as assets, not ad previews.",
  "NotFair exposes no ad-preview renderer. AdPilot renders RSA text previews itself and shows real image-asset URLs when the asset is linked to a campaign.",
  "Google Ads 'conversions' are platform conversions (Booked demo meeting, Contact page form, Calls from ads…). MQL/SQL/opportunity/pipeline/revenue require CRM (HubSpot) attribution and are not provided by NotFair.",
  "Writes go through NotFair guardrails and the Google Ads API; AdPilot requires human approval before calling any execute capability.",
  "MCP tool results are JSON text blocks; runScript responses are capped at 500KB and 45s — AdPilot batches GAQL with gaqlParallel and pages by date.",
];

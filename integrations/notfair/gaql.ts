/**
 * GAQL scripts executed through NotFair's `google_ads_runScript`.
 * Each script was run against the live SketchDeck account during
 * verification (2026-09-14); the row shapes are captured in ./fixtures.
 *
 * Notes from the runtime contract:
 * - Rows carry `_name` siblings for enums (e.g. status_name) and `_value`
 *   siblings for *_micros fields (e.g. cost_value in dollars).
 * - Date literals must be GAQL literals or BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'.
 */

export function campaignInventoryScript() {
  return `
const r = await ads.gaqlParallel([
  { name: 'campaigns', query: \`SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.start_date, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'\`, limit: 500 },
  { name: 'customer', query: \`SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer\`, limit: 1 }
]);
return { campaigns: r.campaigns.error ? [] : r.campaigns.rows, customer: r.customer.error ? null : (r.customer.rows || [])[0], errors: { campaigns: r.campaigns.error || null, customer: r.customer.error || null } };
`;
}

export function dailyCampaignMetricsScript(start: string, end: string) {
  return `
const r = await ads.gaql(\`SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}' AND campaign.status != 'REMOVED'\`, 5000);
return { rows: r.rows || [], truncated: !!r.truncated };
`;
}

export function creativesScript(start: string, end: string) {
  return `
const r = await ads.gaqlParallel([
  { name: 'ads', query: \`SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_display_ad.marketing_images, ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.ad.responsive_display_ad.long_headline, ad_group_ad.ad.responsive_display_ad.descriptions, ad_group_ad.ad.image_ad.image_url, ad_group_ad.ad.image_ad.preview_image_url, ad_group_ad.ad.video_ad.video.asset, ad_group_ad.policy_summary.approval_status, ad_group.id, ad_group.name, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM ad_group_ad WHERE segments.date BETWEEN '${start}' AND '${end}' AND ad_group_ad.status != 'REMOVED'\`, limit: 500 },
  { name: 'imageAssets', query: \`SELECT asset.id, asset.name, asset.type, asset.image_asset.full_size.url, asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels, asset.image_asset.mime_type FROM asset WHERE asset.type = 'IMAGE'\`, limit: 500 },
  { name: 'videoAssets', query: \`SELECT asset.id, asset.name, asset.type, asset.youtube_video_asset.youtube_video_id, asset.youtube_video_asset.youtube_video_title FROM asset WHERE asset.type = 'YOUTUBE_VIDEO'\`, limit: 200 },
  { name: 'campaignImageLinks', query: \`SELECT campaign.id, asset.id, campaign_asset.field_type, campaign_asset.status FROM campaign_asset WHERE campaign_asset.field_type IN ('MARKETING_IMAGE','SQUARE_MARKETING_IMAGE','PORTRAIT_MARKETING_IMAGE','AD_IMAGE','LOGO','LANDSCAPE_LOGO')\`, limit: 500 }
]);
const out = {};
for (const k of Object.keys(r)) out[k] = r[k].error ? { rows: [], error: r[k].error } : { rows: r[k].rows || [], truncated: !!r[k].truncated };
return out;
`;
}

export function dailyAdMetricsScript(start: string, end: string) {
  return `
const r = await ads.gaql(\`SELECT ad_group_ad.ad.id, campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM ad_group_ad WHERE segments.date BETWEEN '${start}' AND '${end}' AND ad_group_ad.status != 'REMOVED'\`, 10000);
return { rows: r.rows || [], truncated: !!r.truncated };
`;
}

export function conversionActionsScript(start: string, end: string) {
  return `
const r = await ads.gaqlParallel([
  { name: 'actions', query: \`SELECT conversion_action.id, conversion_action.name, conversion_action.category, conversion_action.primary_for_goal, conversion_action.status, conversion_action.type FROM conversion_action\`, limit: 100 },
  { name: 'byCampaign', query: \`SELECT campaign.id, segments.date, segments.conversion_action_name, metrics.all_conversions FROM campaign WHERE segments.date BETWEEN '${start}' AND '${end}'\`, limit: 5000 }
]);
return { actions: r.actions.error ? [] : r.actions.rows, byCampaign: r.byCampaign.error ? [] : r.byCampaign.rows };
`;
}

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
  { name: 'campaigns', query: \`SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'\`, limit: 500 },
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

/**
 * Keyword-level daily metrics. NotFair caps each GAQL result by byte budget
 * (~40KB, verified 2026-09-16: a 7-day keyword query returned 66 rows then
 * truncated), so the script runs one query per day via gaqlParallel and
 * returns compact tuples. Days that still truncate are reported, never
 * silently dropped.
 *
 * Tuple: [campaignId, adGroupId, adGroupName, adGroupStatus, criterionId,
 *         keyword, matchType, status, qualityScore, date, cost, impressions,
 *         clicks, conversions, conversionValue, topImpressionPct, searchImpressionShare]
 */
export function keywordDailyScript(days: string[]) {
  return `
const days = ${JSON.stringify(days)};
const q = (d) => \`SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, ad_group.id, ad_group.name, ad_group.status, campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.top_impression_percentage, metrics.search_impression_share FROM keyword_view WHERE segments.date = '\${d}' AND ad_group_criterion.status != 'REMOVED'\`;
const r = await ads.gaqlParallel(days.map((d) => ({ name: d, query: q(d), limit: 10000 })));
const rows = []; const truncatedDays = []; const errors = {};
for (const d of days) {
  const x = r[d];
  if (!x || x.error) { errors[d] = (x && x.error) || 'missing'; continue; }
  if (x.truncated) truncatedDays.push(d);
  for (const row of x.rows || []) {
    const c = row.ad_group_criterion || {}; const m = row.metrics || {};
    rows.push([String(row.campaign.id), String(row.ad_group.id), row.ad_group.name || '', row.ad_group.status_name || '', String(c.criterion_id), (c.keyword && c.keyword.text) || '', (c.keyword && c.keyword.match_type_name) || 'UNSPECIFIED', c.status_name || '', c.quality_info ? c.quality_info.quality_score : null, row.segments.date, m.cost_value != null ? m.cost_value : (m.cost_micros || 0) / 1e6, m.impressions || 0, m.clicks || 0, m.conversions || 0, m.conversions_value || 0, m.top_impression_percentage == null ? null : m.top_impression_percentage, m.search_impression_share == null ? null : m.search_impression_share]);
  }
}
return { rows, truncatedDays, errors };
`;
}

/**
 * Search-term daily metrics (same per-day batching as keywords).
 * Tuple: [campaignId, adGroupId, adGroupName, searchTerm, status, keyword,
 *         matchType, date, cost, impressions, clicks, conversions, conversionValue]
 */
export function searchTermDailyScript(days: string[]) {
  return `
const days = ${JSON.stringify(days)};
const q = (d) => \`SELECT search_term_view.search_term, search_term_view.status, segments.keyword.info.text, segments.keyword.info.match_type, ad_group.id, ad_group.name, campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM search_term_view WHERE segments.date = '\${d}'\`;
const r = await ads.gaqlParallel(days.map((d) => ({ name: d, query: q(d), limit: 10000 })));
const rows = []; const truncatedDays = []; const errors = {};
for (const d of days) {
  const x = r[d];
  if (!x || x.error) { errors[d] = (x && x.error) || 'missing'; continue; }
  if (x.truncated) truncatedDays.push(d);
  for (const row of x.rows || []) {
    const s = row.search_term_view || {}; const k = (row.segments.keyword && row.segments.keyword.info) || {}; const m = row.metrics || {};
    rows.push([String(row.campaign.id), String(row.ad_group.id), row.ad_group.name || '', s.search_term || '', s.status_name || 'UNKNOWN', k.text || '', k.match_type_name || 'UNSPECIFIED', row.segments.date, m.cost_value != null ? m.cost_value : (m.cost_micros || 0) / 1e6, m.impressions || 0, m.clicks || 0, m.conversions || 0, m.conversions_value || 0]);
  }
}
return { rows, truncatedDays, errors };
`;
}

export interface DailyTupleResult {
  rows: unknown[][];
  truncatedDays: string[];
  errors: Record<string, unknown>;
}

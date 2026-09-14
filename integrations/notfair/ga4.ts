/** GA4 scripts executed through NotFair's `google_analytics_runScript`. */

export function ga4PaidPerformanceScript(start: string, end: string) {
  return `
const r = await analytics.runReportParallel([
  { name: 'channels', body: { dateRanges: [{ startDate: '${start}', endDate: '${end}' }], dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions','totalUsers','keyEvents','engagementRate'], limit: 50 } },
  { name: 'campaigns', body: { dateRanges: [{ startDate: '${start}', endDate: '${end}' }], dimensions: ['sessionSourceMedium','sessionCampaignName'], metrics: ['sessions','keyEvents'], limit: 200 } },
  { name: 'keyEvents', body: { dateRanges: [{ startDate: '${start}', endDate: '${end}' }], dimensions: ['eventName','sessionCampaignName'], metrics: ['keyEvents'], limit: 500 } }
]);
const pick = (x) => (x && x.ok ? x.data.rows || [] : []);
return { propertyId: analytics.activePropertyId, channels: pick(r.channels), campaigns: pick(r.campaigns), keyEvents: pick(r.keyEvents) };
`;
}

export interface Ga4Row {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
}

export interface Ga4PaidPerformance {
  propertyId: string;
  channels: Ga4Row[];
  campaigns: Ga4Row[];
  keyEvents: Ga4Row[];
}

/** Key events that represent a lead for SketchDeck (verified in GA4 config). */
export const SKETCHDECK_LEAD_EVENTS = ["hubspot_form_submit", "hubspot_meeting_success"];

/** Sum lead key events by campaign name (as tagged in GA4). */
export function leadsByCampaignName(data: Ga4PaidPerformance): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of data.keyEvents) {
    const [eventName, campaign] = row.dimensionValues.map((d) => d.value);
    if (!SKETCHDECK_LEAD_EVENTS.includes(eventName)) continue;
    const n = Number(row.metricValues[0]?.value ?? 0);
    out.set(campaign, (out.get(campaign) ?? 0) + n);
  }
  return out;
}

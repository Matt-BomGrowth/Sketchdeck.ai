import type { NormalizedGa4Daily } from "@/integrations/types";

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

// ───────────────────────────── Daily detail ─────────────────────────────

/**
 * GA4 daily rows by channel group, landing page and key event × channel.
 * Verified live on 2026-09-16 (property properties/454640302): 7 days →
 * 52 channel rows, 172 landing-page rows, 7 key-event rows, 676ms.
 * The script returns compact tuples to stay under NotFair's 500KB cap.
 */
export function ga4DailyScript(start: string, end: string) {
  return `
const dr = [{ startDate: '${start}', endDate: '${end}' }];
const r = await analytics.runReportParallel([
  { name: 'channels', body: { dateRanges: dr, dimensions: ['date','sessionDefaultChannelGroup'], metrics: ['sessions','totalUsers','newUsers','engagedSessions','keyEvents'], limit: 10000 } },
  { name: 'landing', body: { dateRanges: dr, dimensions: ['date','landingPage'], metrics: ['sessions','totalUsers','engagedSessions','keyEvents'], limit: 10000, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] } },
  { name: 'keyEvents', body: { dateRanges: dr, dimensions: ['date','eventName','sessionDefaultChannelGroup'], metrics: ['keyEvents'], limit: 10000 } }
]);
const d = (row, i) => row.dimensionValues[i].value; const m = (row, i) => Number(row.metricValues[i].value || 0);
const iso = (s) => s.length === 8 ? s.slice(0,4) + '-' + s.slice(4,6) + '-' + s.slice(6,8) : s;
const out = { propertyId: analytics.activePropertyId, channels: [], landing: [], keyEvents: [], errors: {} };
if (r.channels && r.channels.ok) for (const row of r.channels.data.rows || []) out.channels.push([iso(d(row,0)), d(row,1), m(row,0), m(row,1), m(row,2), m(row,3), m(row,4)]); else out.errors.channels = r.channels && r.channels.error;
if (r.landing && r.landing.ok) for (const row of r.landing.data.rows || []) out.landing.push([iso(d(row,0)), d(row,1), m(row,0), m(row,1), m(row,2), m(row,3)]); else out.errors.landing = r.landing && r.landing.error;
if (r.keyEvents && r.keyEvents.ok) for (const row of r.keyEvents.data.rows || []) out.keyEvents.push([iso(d(row,0)), d(row,1), d(row,2), m(row,0)]); else out.errors.keyEvents = r.keyEvents && r.keyEvents.error;
return out;
`;
}

export interface Ga4DailyResult {
  propertyId: string;
  /** [date, channel, sessions, users, newUsers, engagedSessions, keyEvents] */
  channels: unknown[][];
  /** [date, landingPage, sessions, users, engagedSessions, keyEvents] */
  landing: unknown[][];
  /** [date, eventName, channel, keyEvents] */
  keyEvents: unknown[][];
  errors: Record<string, unknown>;
}

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export function normalizeGa4Daily(data: Ga4DailyResult): NormalizedGa4Daily[] {
  const out: NormalizedGa4Daily[] = [];
  for (const t of data.channels ?? []) {
    if (!t[0]) continue;
    out.push({
      date: String(t[0]),
      dimension: "channel",
      value: String(t[1] ?? "(other)"),
      subValue: "",
      sessions: n(t[2]),
      users: n(t[3]),
      newUsers: n(t[4]),
      engagedSessions: n(t[5]),
      keyEvents: n(t[6]),
    });
  }
  for (const t of data.landing ?? []) {
    if (!t[0]) continue;
    out.push({
      date: String(t[0]),
      dimension: "landing_page",
      value: String(t[1] ?? "(not set)"),
      subValue: "",
      sessions: n(t[2]),
      users: n(t[3]),
      newUsers: 0,
      engagedSessions: n(t[4]),
      keyEvents: n(t[5]),
    });
  }
  for (const t of data.keyEvents ?? []) {
    if (!t[0] || !n(t[3])) continue;
    out.push({
      date: String(t[0]),
      dimension: "key_event",
      value: String(t[2] ?? "(other)"),
      subValue: String(t[1] ?? ""),
      sessions: 0,
      users: 0,
      newUsers: 0,
      engagedSessions: 0,
      keyEvents: n(t[3]),
    });
  }
  return out;
}

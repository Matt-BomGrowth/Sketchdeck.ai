/**
 * HubSpot verification report — shared by the CLI script and the deployed
 * endpoint. Reads HUBSPOT_ACCESS_TOKEN (the HubSpot Service Key) server-side
 * only; the report never contains the key.
 */
import { HubSpotConnector } from "./connector";
import { attributeFunnelEvents } from "@/integrations/attribution";
import type { Campaign } from "@/types/domain";

/** Campaign names in SketchDeck's Google Ads account (verified via NotFair on 2026-09-14). */
export const KNOWN_GOOGLE_CAMPAIGNS: Campaign[] = [
  "USA,CA | Core Phrases | Search | [tCPA $600]",
  "USA,CA | Search | Brand | [mCPC]",
  "USA,CA | Search | Competitors | [tCPA $600]",
  "pilot-campaign | search | sketchdeck.ai | $1000/m",
].map((name, i) => ({ id: `g${i}`, organizationId: "verify", platform: "google", externalId: `g${i}`, name, status: "active", objective: "demo_requests", dailyBudget: 0, currency: "USD", country: "", industry: "", icpSegment: "", channelType: "Search", startedAt: "" }));

export const AGENCY_PORTAL_ID = 23696525;

export interface HubSpotVerification {
  ok: boolean;
  checkedAt: string;
  portal?: { portalId: number; accountType: string; companyCurrency: string; timeZone: string; isAgencyPortal: boolean };
  window?: { start: string; end: string };
  events?: {
    total: number;
    byStage: Record<string, number>;
    bySource: Record<string, number>;
    closedWonAmount: number;
    topCampaignLabels: Array<{ label: string; count: number }>;
  };
  attribution?: { matchedByName: number; matchedByChannel: number; unattributed: number; unattributedSamples: string[] };
  verdict: string[];
  error?: string;
}

export async function verifyHubSpot(connector = new HubSpotConnector(), days = 90): Promise<HubSpotVerification> {
  const checkedAt = new Date().toISOString();
  if (!connector.isConfigured()) {
    return { ok: false, checkedAt, verdict: ["HUBSPOT_ACCESS_TOKEN is not set in this environment."], error: "not_configured" };
  }
  try {
    const p = await connector.describePortal();
    const portal = { portalId: p.portalId, accountType: p.accountType, companyCurrency: p.companyCurrency, timeZone: p.timeZone, isAgencyPortal: p.portalId === AGENCY_PORTAL_ID };

    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    const window = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    const events = await connector.fetchFunnelEvents(window);

    const byStage: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byCampaign = new Map<string, number>();
    let closedWonAmount = 0;
    for (const e of events) {
      byStage[e.stage] = (byStage[e.stage] ?? 0) + 1;
      const src = e.source ?? "(none)";
      bySource[src] = (bySource[src] ?? 0) + 1;
      if (e.campaignName) byCampaign.set(e.campaignName, (byCampaign.get(e.campaignName) ?? 0) + 1);
      if (e.stage === "closed_won") closedWonAmount += e.amount ?? 0;
    }
    const report = attributeFunnelEvents(events, KNOWN_GOOGLE_CAMPAIGNS, new Map());
    const paid = (bySource.PAID_SEARCH ?? 0) + (bySource.PAID_SOCIAL ?? 0);

    const verdict: string[] = [];
    verdict.push(portal.isAgencyPortal ? `Portal ${portal.portalId} is the BOM Growth agency CRM — AdPilot needs SketchDeck's own portal.` : `Portal ${portal.portalId} reachable (${portal.companyCurrency}, ${portal.timeZone}).`);
    verdict.push(paid > 0 ? `${paid} paid-media funnel events in the last ${days} days — this portal can feed AdPilot's funnel.` : `No paid-search or paid-social funnel events in the last ${days} days — wrong portal, or HubSpot tracking is not attributing paid traffic on sketchdeck.ai.`);
    verdict.push(`Attribution to Google Ads campaign names: ${report.matchedByName} by name, ${report.matchedByChannel} by channel fallback, ${report.unattributed} unattributed.`);

    return {
      ok: !portal.isAgencyPortal && paid > 0,
      checkedAt,
      portal,
      window,
      events: { total: events.length, byStage, bySource, closedWonAmount: Math.round(closedWonAmount), topCampaignLabels: [...byCampaign.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, count]) => ({ label, count })) },
      attribution: { matchedByName: report.matchedByName, matchedByChannel: report.matchedByChannel, unattributed: report.unattributed, unattributedSamples: report.unattributedSamples },
      verdict,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, checkedAt, verdict: [`HubSpot request failed: ${message}`], error: message };
  }
}

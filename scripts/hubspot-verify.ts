/**
 * Verify a HubSpot private-app token for AdPilot without storing it anywhere.
 *
 *   # .env.local:  HUBSPOT_ACCESS_TOKEN=<private app token>
 *   npm run hubspot:verify
 *
 * Prints: which portal the token belongs to, whether it looks like a marketing
 * portal with paid-media leads, the last 90 days of funnel events grouped by
 * stage and top campaign labels, and the attribution match rate against the
 * campaign names in the Google Ads account. Nothing is written.
 */
import "@/lib/config/load-env";
import { HubSpotConnector } from "@/integrations/hubspot/connector";
import { attributeFunnelEvents } from "@/integrations/attribution";
import type { Campaign } from "@/types/domain";

// Campaign names as they exist in SketchDeck's Google Ads account (verified via NotFair on 2026-09-14).
const KNOWN_CAMPAIGNS: Campaign[] = [
  "USA,CA | Core Phrases | Search | [tCPA $600]",
  "USA,CA | Search | Brand | [mCPC]",
  "USA,CA | Search | Competitors | [tCPA $600]",
  "pilot-campaign | search | sketchdeck.ai | $1000/m",
].map((name, i) => ({ id: `g${i}`, organizationId: "verify", platform: "google", externalId: `g${i}`, name, status: "active", objective: "demo_requests", dailyBudget: 0, currency: "USD", country: "", industry: "", icpSegment: "", channelType: "Search", startedAt: "" }));

async function main() {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) throw new Error("HUBSPOT_ACCESS_TOKEN is not set. Add it to .env.local (git-ignored); never commit it.");
  const hs = new HubSpotConnector();
  const portal = await hs.describePortal();
  console.log(`Portal ${portal.portalId} · ${portal.accountType} · ${portal.companyCurrency} · ${portal.timeZone}`);
  console.log("→ Confirm this is SketchDeck's portal (the BOM Growth agency portal is 23696525).\n");

  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  const range = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  const events = await hs.fetchFunnelEvents(range);

  const byStage = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byCampaign = new Map<string, number>();
  let amount = 0;
  for (const e of events) {
    byStage.set(e.stage, (byStage.get(e.stage) ?? 0) + 1);
    bySource.set(e.source ?? "(none)", (bySource.get(e.source ?? "(none)") ?? 0) + 1);
    if (e.campaignName) byCampaign.set(e.campaignName, (byCampaign.get(e.campaignName) ?? 0) + 1);
    if (e.stage === "closed_won") amount += e.amount ?? 0;
  }
  console.log(`Funnel events, last 90 days: ${events.length}`);
  console.log("  by stage:", Object.fromEntries(byStage));
  console.log("  by original source:", Object.fromEntries(bySource));
  console.log("  closed-won amount:", amount.toFixed(0));
  console.log("  top campaign labels:", [...byCampaign.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));

  const report = attributeFunnelEvents(events, KNOWN_CAMPAIGNS, new Map());
  console.log(`\nAttribution against Google Ads campaign names: name-matched ${report.matchedByName}, channel fallback ${report.matchedByChannel}, unattributed ${report.unattributed}`);
  if (report.unattributedSamples.length) console.log("  unattributed samples:", report.unattributedSamples);
  const paid = (bySource.get("PAID_SEARCH") ?? 0) + (bySource.get("PAID_SOCIAL") ?? 0);
  console.log(paid > 0 ? "\n✅ Paid-media contacts present — this portal can feed AdPilot's funnel." : "\n⚠️  No paid-media contacts found — this may be the wrong portal, or tracking is not attributing paid traffic.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

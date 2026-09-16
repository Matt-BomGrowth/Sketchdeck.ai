import { describe, expect, it } from "vitest";
import { attributeFunnelEvents, derivedSocialCampaigns, normalizeLabel, spendIndex } from "@/integrations/attribution";
import type { Campaign } from "@/types/domain";
import type { CrmFunnelEvent } from "@/integrations/types";

const campaign = (id: string, name: string, platform: Campaign["platform"]): Campaign => ({
  id, organizationId: "o", platform, externalId: id, name, status: "active", objective: "demo_requests", dailyBudget: 100, currency: "USD", country: "", industry: "", icpSegment: "", channelType: "Search", startedAt: "2026-01-01",
});

const campaigns = [campaign("core", "USA,CA | Core Phrases | Search | [tCPA $600]", "google"), campaign("brand", "USA,CA | Search | Brand | [mCPC]", "google"), campaign("li", "LinkedIn | Chief Estimators", "linkedin")];

describe("attribution", () => {
  it("normalizes campaign labels the way GA4/HubSpot mangle them", () => {
    expect(normalizeLabel("USA,CA+|+Core+Phrases+|+Search+|+[tCPA+$600]")).toBe(normalizeLabel("USA,CA | Core Phrases | Search | [tCPA $600]"));
  });

  it("matches by campaign name first, then by channel to the highest-spend campaign of the day", () => {
    const events: CrmFunnelEvent[] = [
      { externalContactId: "1", stage: "mql", occurredAt: "2026-09-10T10:00:00Z", campaignName: "USA,CA+|+Core+Phrases+|+Search+|+[tCPA+$600]", source: "PAID_SEARCH" },
      { externalContactId: "2", stage: "sql", occurredAt: "2026-09-10T11:00:00Z", source: "PAID_SEARCH" },
      { externalContactId: "3", stage: "opportunity", occurredAt: "2026-09-11T11:00:00Z", source: "PAID_SOCIAL", clickIds: { linkedin: "li_fat" }, amount: 48000 },
      { externalContactId: "4", stage: "closed_won", occurredAt: "2026-09-12T11:00:00Z", source: "ORGANIC_SEARCH", amount: 20000 },
    ];
    const spend = spendIndex(
      [
        { externalCampaignId: "core", date: "2026-09-10", spend: 500, impressions: 0, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 },
        { externalCampaignId: "brand", date: "2026-09-10", spend: 40, impressions: 0, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 },
      ],
      new Map([["core", "core"], ["brand", "brand"]]),
    );
    const r = attributeFunnelEvents(events, campaigns, spend);
    expect(r.matchedByName).toBe(1);
    expect(r.matchedByChannel).toBe(2);
    expect(r.unattributed).toBe(1);
    const core = r.rows.find((x) => x.campaignId === "core" && x.date === "2026-09-10");
    expect(core?.mqls).toBe(1);
    expect(core?.sqls).toBe(1); // channel fallback → highest spend Google campaign
    const li = r.rows.find((x) => x.campaignId === "li");
    expect(li?.opportunities).toBe(1);
    expect(li?.pipeline).toBe(48000);
    expect(r.rows.reduce((s, x) => s + x.revenue, 0)).toBe(0); // organic closed-won never credited to paid
  });

  it("never invents a campaign for ambiguous paid social without a click id", () => {
    const r = attributeFunnelEvents([{ externalContactId: "1", stage: "lead", occurredAt: "2026-09-10T00:00:00Z", source: "PAID_SOCIAL" }], campaigns, new Map());
    expect(r.unattributed).toBe(1);
    expect(r.rows).toHaveLength(0);
  });

  it("uses HubSpot's network drill-down to resolve paid social to a platform", () => {
    const r = attributeFunnelEvents(
      [{ externalContactId: "1", stage: "mql", occurredAt: "2026-09-10T00:00:00Z", source: "PAID_SOCIAL", sourceDetail: "linkedin" }],
      campaigns,
      new Map(),
    );
    expect(r.matchedByChannel).toBe(1);
    expect(r.rows[0]?.campaignId).toBe("li");
  });

  it("derives spend-less placeholder campaigns for paid-social labels the CRM knows but no connector supplies", () => {
    const events: CrmFunnelEvent[] = [
      { externalContactId: "1", stage: "lead", occurredAt: "2026-09-10T00:00:00Z", source: "PAID_SOCIAL", sourceDetail: "linkedin", campaignName: "Q3+ABM+|+VP+Marketing" },
      { externalContactId: "2", stage: "sql", occurredAt: "2026-09-11T00:00:00Z", source: "PAID_SOCIAL", sourceDetail: "linkedin", campaignName: "Q3 ABM | VP Marketing" },
      { externalContactId: "3", stage: "lead", occurredAt: "2026-09-11T00:00:00Z", source: "PAID_SOCIAL", sourceDetail: "linkedin", campaignName: "LinkedIn | Chief Estimators" },
      { externalContactId: "4", stage: "lead", occurredAt: "2026-09-11T00:00:00Z", source: "PAID_SEARCH", campaignName: "Some new Google campaign" },
      { externalContactId: "5", stage: "lead", occurredAt: "2026-09-11T00:00:00Z", source: "PAID_SOCIAL", campaignName: "Mystery social" },
    ];
    const derived = derivedSocialCampaigns(events, campaigns, new Set(["google"]));
    expect(derived).toHaveLength(1); // same label twice → one; known LinkedIn campaign, Google, and ambiguous social skipped
    expect(derived[0]).toMatchObject({ platform: "linkedin", externalId: "hubspot:q3 abm vp marketing", name: "Q3 ABM | VP Marketing", dailyBudget: 0 });
    expect(derivedSocialCampaigns(events, campaigns, new Set(["google", "linkedin"]))).toHaveLength(0);
    // Once created, the same events attribute to the placeholder by name.
    const withPlaceholder = [...campaigns, campaign("hubspot:q3 abm vp marketing", "Q3 ABM | VP Marketing", "linkedin")];
    const r = attributeFunnelEvents(events.slice(0, 2), withPlaceholder, new Map());
    expect(r.matchedByName).toBe(2);
  });
});

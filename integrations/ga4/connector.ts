import type { IntegrationStatus } from "@/types/domain";
import type { Connector } from "@/integrations/types";
import { getNotFairClient, NotFairClient } from "@/integrations/notfair/client";
import { READ } from "@/integrations/notfair/capabilities";
import { ga4PaidPerformanceScript, leadsByCampaignName, type Ga4PaidPerformance } from "@/integrations/notfair/ga4";

/**
 * Google Analytics 4 via NotFair MCP (verified: property properties/454640302,
 * key events hubspot_form_submit / hubspot_meeting_success / email_clicks / phone_click).
 */
export class Ga4Connector implements Connector {
  key = "ga4" as const;
  name = "Google Analytics 4";
  platforms = [];

  constructor(private readonly client: NotFairClient = getNotFairClient(), private readonly propertyId = process.env.GA4_PROPERTY_ID) {}

  isConfigured() {
    return this.client.isConfigured();
  }

  async checkHealth(): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return { key: this.key, name: this.name, health: "not_configured", detail: "GA4 is read through NotFair MCP; set NOTFAIR_MCP_URL." };
    try {
      const props = await this.client.executeRead<Array<{ name: string; displayName?: string; active?: boolean; availableForTools?: boolean }> | { properties?: unknown[] }>(READ.ga4ListProperties);
      const list = Array.isArray(props) ? props : [];
      const active = list.find((p) => p.active) ?? list[0];
      return { key: this.key, name: this.name, health: "connected", detail: active ? `Property ${active.displayName ?? active.name}` : "GA4 reachable", lastSyncAt: new Date().toISOString() };
    } catch (err) {
      return { key: this.key, name: this.name, health: "connection_issue", detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async fetchPaidPerformance(start: string, end: string): Promise<{ data: Ga4PaidPerformance; leadsByCampaign: Map<string, number> }> {
    const data = await this.client.runGa4Script<Ga4PaidPerformance>(ga4PaidPerformanceScript(start, end), { propertyId: this.propertyId });
    return { data, leadsByCampaign: leadsByCampaignName(data) };
  }
}

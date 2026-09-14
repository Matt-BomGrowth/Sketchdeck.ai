import type { IntegrationStatus } from "@/types/domain";
import type { Connector } from "@/integrations/types";

/**
 * Direct Google Ads API (OAuth + developer token).
 *
 * SketchDeck's Google Ads account is already reachable through the NotFair
 * MCP connection, which is AdPilot's primary path. A direct connector is
 * reserved for organizations without NotFair; it reports not_configured until
 * GOOGLE_ADS_* credentials are present and is not implemented beyond that.
 */
export class GoogleAdsDirectConnector implements Connector {
  key = "google_ads" as const;
  name = "Google Ads (direct API)";
  platforms = ["google" as const];

  isConfigured() {
    return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET && process.env.GOOGLE_ADS_REFRESH_TOKEN && process.env.GOOGLE_ADS_CUSTOMER_ID);
  }

  async checkHealth(): Promise<IntegrationStatus> {
    if (!this.isConfigured()) {
      return { key: this.key, name: this.name, health: "not_configured", detail: "Google Ads data flows through NotFair MCP. Direct API credentials (GOOGLE_ADS_*) are optional." };
    }
    return { key: this.key, name: this.name, health: "connection_issue", detail: "Direct Google Ads API client is not implemented yet; use NotFair MCP." };
  }
}

import type { IntegrationStatus } from "@/types/domain";
import type { Connector } from "@/integrations/types";
import { getNotFairClient, NotFairClient } from "@/integrations/notfair/client";

/**
 * Google Search Console via NotFair MCP (site https://www.sketchdeck.ai/,
 * connected in the SketchDeck workspace as of 2026-09-16). Health reports
 * "not_configured" honestly if the platform is ever disconnected in NotFair.
 */
export class SearchConsoleConnector implements Connector {
  key = "search_console" as const;
  name = "Google Search Console";
  platforms = [];

  constructor(private readonly client: NotFairClient = getNotFairClient()) {}

  isConfigured() {
    return this.client.isConfigured();
  }

  async checkHealth(): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return { key: this.key, name: this.name, health: "not_configured", detail: "Search Console is read through NotFair MCP; set NOTFAIR_MCP_URL." };
    try {
      const res = await this.client.search("search console top queries", "search_console");
      const connected = res.connectedPlatforms.some((p) => p.platform === "search_console");
      return connected
        ? { key: this.key, name: this.name, health: "connected", detail: "Search Console connected in NotFair.", capabilities: res.capabilities.map((c) => c.id) }
        : { key: this.key, name: this.name, health: "not_configured", detail: res.notice ?? "Search Console is not connected in the NotFair workspace. Connect it in NotFair to enable search opportunity insights." };
    } catch (err) {
      return { key: this.key, name: this.name, health: "connection_issue", detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

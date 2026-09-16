import type { IntegrationStatus } from "@/types/domain";
import type { DateRange, NormalizedSearchConsoleDaily, SearchConnector } from "@/integrations/types";
import { getNotFairClient, NotFairClient } from "@/integrations/notfair/client";
import { normalizeSearchConsoleDaily, searchConsoleDailyScript, type SearchConsoleDailyResult } from "@/integrations/notfair/search-console";

/**
 * Google Search Console via NotFair MCP (site https://www.sketchdeck.ai/,
 * connected in the SketchDeck workspace as of 2026-09-16). Health reports
 * "not_configured" honestly if the platform is ever disconnected in NotFair.
 */
export class SearchConsoleConnector implements SearchConnector {
  key = "search_console" as const;
  name = "Google Search Console";
  platforms = [];

  constructor(
    private readonly client: NotFairClient = getNotFairClient(),
    private readonly siteUrl = process.env.SEARCH_CONSOLE_SITE_URL,
  ) {}

  isConfigured() {
    return this.client.isConfigured();
  }

  async checkHealth(): Promise<IntegrationStatus> {
    if (!this.isConfigured())
      return { key: this.key, name: this.name, health: "not_configured", detail: "Search Console is read through NotFair MCP; set NOTFAIR_MCP_URL." };
    try {
      const res = await this.client.search("search console top queries", "search_console");
      const connected = res.connectedPlatforms.some((p) => p.platform === "search_console");
      return connected
        ? {
            key: this.key,
            name: this.name,
            health: "connected",
            detail: "Search Console connected in NotFair.",
            capabilities: res.capabilities.map((c) => c.id),
          }
        : {
            key: this.key,
            name: this.name,
            health: "not_configured",
            detail: res.notice ?? "Search Console is not connected in the NotFair workspace. Connect it in NotFair to enable search opportunity insights.",
          };
    } catch (err) {
      return { key: this.key, name: this.name, health: "connection_issue", detail: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Daily clicks/impressions/position for the site, top queries and top pages (stored in search_console_daily). */
  async fetchDaily(range: DateRange): Promise<NormalizedSearchConsoleDaily[]> {
    const data = await this.client.runSearchConsoleScript<SearchConsoleDailyResult>(searchConsoleDailyScript(range.start, range.end), {
      siteUrl: this.siteUrl,
    });
    const failed = Object.entries(data.errors ?? {}).filter(([, v]) => v);
    if (failed.length)
      throw new Error(
        `Search Console query failed: ${failed
          .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join("; ")
          .slice(0, 500)}`,
      );
    return normalizeSearchConsoleDaily(data);
  }
}

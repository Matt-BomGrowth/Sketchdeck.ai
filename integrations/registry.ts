import type { IntegrationStatus } from "@/types/domain";
import type { AdPlatformConnector, AnalyticsConnector, Connector, CrmConnector, SearchConnector } from "./types";
import { NotFairGoogleAdsConnector } from "./notfair/connector";
import { MetaAdsConnector } from "./meta/connector";
import { LinkedInAdsConnector } from "./linkedin/connector";
import { HubSpotConnector } from "./hubspot/connector";
import { Ga4Connector } from "./ga4/connector";
import { SearchConsoleConnector } from "./search-console/connector";
import { GoogleAdsDirectConnector } from "./google-ads/connector";

/** All integrations, each an independent module with its own health. */
export function allConnectors(): Connector[] {
  return [
    new NotFairGoogleAdsConnector(),
    new GoogleAdsDirectConnector(),
    new MetaAdsConnector(),
    new LinkedInAdsConnector(),
    new HubSpotConnector(),
    new Ga4Connector(),
    new SearchConsoleConnector(),
  ];
}

export function adPlatformConnectors(): AdPlatformConnector[] {
  return [new NotFairGoogleAdsConnector(), new MetaAdsConnector(), new LinkedInAdsConnector()];
}

export function crmConnectors(): CrmConnector[] {
  return [new HubSpotConnector()];
}

export function analyticsConnectors(): AnalyticsConnector[] {
  return [new Ga4Connector()];
}

export function searchConnectors(): SearchConnector[] {
  return [new SearchConsoleConnector()];
}

/**
 * Check every integration independently. A failure in one never affects the
 * others — the dashboard keeps showing whatever is healthy.
 */
export async function checkAllIntegrations(): Promise<IntegrationStatus[]> {
  const connectors = allConnectors();
  const results = await Promise.allSettled(connectors.map((c) => withTimeout(c.checkHealth(), 8000)));
  return results.map((r, i) => {
    const c = connectors[i];
    if (r.status === "fulfilled") return r.value;
    return { key: c.key, name: c.name, health: "connection_issue", detail: r.reason instanceof Error ? r.reason.message : String(r.reason) };
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

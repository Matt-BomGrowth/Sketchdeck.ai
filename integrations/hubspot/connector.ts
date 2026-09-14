import type { IntegrationStatus } from "@/types/domain";
import type { CrmConnector, CrmFunnelEvent, DateRange } from "@/integrations/types";

/**
 * HubSpot CRM connector (official REST API v3, private-app token).
 *
 * Maps HubSpot lifecycle stages to AdPilot funnel stages:
 *   lead → lead, marketingqualifiedlead → mql, salesqualifiedlead → sql,
 *   opportunity → opportunity, customer → closed_won.
 * Deal amounts feed pipeline/revenue.
 *
 * Status: implemented against the documented API shape; NOT yet verified
 * against a live SketchDeck portal in this environment (no token present).
 */
const BASE = "https://api.hubapi.com";

export class HubSpotConnector implements CrmConnector {
  key = "hubspot" as const;
  name = "HubSpot CRM";
  platforms = [];

  constructor(private readonly token = process.env.HUBSPOT_ACCESS_TOKEN) {}

  isConfigured() {
    return Boolean(this.token);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (res.status === 429) throw new Error("HubSpot rate limit reached (429). Retry after the Retry-After interval.");
    if (!res.ok) throw new Error(`HubSpot ${path} → ${res.status} ${await res.text().catch(() => "")}`);
    return (await res.json()) as T;
  }

  async checkHealth(): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return { key: this.key, name: this.name, health: "not_configured", detail: "Set HUBSPOT_ACCESS_TOKEN (private app) to connect." };
    try {
      await this.request("/crm/v3/objects/contacts?limit=1");
      return { key: this.key, name: this.name, health: "connected", detail: "Contacts API reachable.", lastSyncAt: new Date().toISOString() };
    } catch (err) {
      return { key: this.key, name: this.name, health: "connection_issue", detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async fetchFunnelEvents(range: DateRange): Promise<CrmFunnelEvent[]> {
    if (!this.isConfigured()) throw new Error("HubSpot is not configured.");
    const events: CrmFunnelEvent[] = [];
    const stageMap: Record<string, CrmFunnelEvent["stage"]> = {
      lead: "lead",
      marketingqualifiedlead: "mql",
      salesqualifiedlead: "sql",
      opportunity: "opportunity",
      customer: "closed_won",
    };
    const from = new Date(`${range.start}T00:00:00Z`).getTime();
    const to = new Date(`${range.end}T23:59:59Z`).getTime();

    // Contacts by lifecycle stage change within the window.
    let after: string | undefined;
    do {
      const body: Record<string, unknown> = {
        filterGroups: [{ filters: [{ propertyName: "lastmodifieddate", operator: "BETWEEN", value: String(from), highValue: String(to) }] }],
        properties: ["email", "lifecyclestage", "jobtitle", "hs_analytics_source", "hs_analytics_first_touch_converting_campaign", "hs_latest_source_data_2", "country", "hs_lifecyclestage_lead_date", "hs_lifecyclestage_marketingqualifiedlead_date", "hs_lifecyclestage_salesqualifiedlead_date", "hs_lifecyclestage_opportunity_date", "hs_lifecyclestage_customer_date"],
        limit: 100,
        after,
      };
      const page = await this.request<{ results: Array<{ id: string; properties: Record<string, string | null> }>; paging?: { next?: { after: string } } }>("/crm/v3/objects/contacts/search", { method: "POST", body: JSON.stringify(body) });
      for (const c of page.results) {
        const p = c.properties;
        for (const [hsStage, stage] of Object.entries(stageMap)) {
          const at = p[`hs_lifecyclestage_${hsStage}_date`];
          if (!at) continue;
          const ts = new Date(at).getTime();
          if (ts < from || ts > to) continue;
          events.push({
            externalContactId: c.id,
            email: p.email ?? undefined,
            stage,
            occurredAt: new Date(ts).toISOString(),
            campaignName: p.hs_analytics_first_touch_converting_campaign ?? p.hs_latest_source_data_2 ?? undefined,
            source: p.hs_analytics_source ?? undefined,
            jobTitle: p.jobtitle ?? undefined,
            country: p.country ?? undefined,
          });
        }
      }
      after = page.paging?.next?.after;
    } while (after);

    // Deals for pipeline/revenue.
    after = undefined;
    do {
      const body: Record<string, unknown> = {
        filterGroups: [{ filters: [{ propertyName: "createdate", operator: "BETWEEN", value: String(from), highValue: String(to) }] }],
        properties: ["dealname", "amount", "dealstage", "closedate", "hs_is_closed_won", "hs_analytics_source", "hs_campaign"],
        limit: 100,
        after,
      };
      const page = await this.request<{ results: Array<{ id: string; properties: Record<string, string | null>; associations?: unknown }>; paging?: { next?: { after: string } } }>("/crm/v3/objects/deals/search", { method: "POST", body: JSON.stringify(body) });
      for (const d of page.results) {
        const p = d.properties;
        const won = p.hs_is_closed_won === "true";
        events.push({
          externalContactId: `deal:${d.id}`,
          stage: won ? "closed_won" : "opportunity",
          occurredAt: new Date(won && p.closedate ? p.closedate : (p.closedate ?? new Date(from).toISOString())).toISOString(),
          amount: p.amount ? Number(p.amount) : undefined,
          campaignName: p.hs_campaign ?? undefined,
          source: p.hs_analytics_source ?? undefined,
        });
      }
      after = page.paging?.next?.after;
    } while (after);

    return events;
  }
}

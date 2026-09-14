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
 * Property names were verified on 2026-09-14 through the HubSpot MCP
 * connection: stage-entry timestamps are `hs_v2_date_entered_<stage>`
 * (the older `hs_lifecyclestage_<stage>_date` names do not exist), and
 * paid-click attribution is available via `hs_google_click_id`,
 * `hs_facebook_click_id`, `hs_linkedin_click_id` plus
 * `hs_analytics_source` / `hs_analytics_source_data_1|2`.
 *
 * IMPORTANT: the portal reachable from this workspace is "BOM Growth"
 * (account 23696525) — the agency CRM, not SketchDeck's marketing portal.
 * Point HUBSPOT_ACCESS_TOKEN at SketchDeck's own portal (where the
 * `hubspot_form_submit` / `hubspot_meeting_success` events originate).
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

  /** Which portal the token belongs to — shown in Integrations so an agency portal is never mistaken for the client's. */
  async describePortal() {
    return this.request<{ portalId: number; uiDomain: string; timeZone: string; companyCurrency: string; accountType: string }>("/account-info/v3/details");
  }

  async checkHealth(): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return { key: this.key, name: this.name, health: "not_configured", detail: "Set HUBSPOT_ACCESS_TOKEN (private app) for SketchDeck's own portal." };
    try {
      const portal = await this.describePortal();
      await this.request("/crm/v3/objects/contacts?limit=1");
      return { key: this.key, name: this.name, health: "connected", detail: `Portal ${portal.portalId} (${portal.companyCurrency}, ${portal.timeZone}) — verify this is SketchDeck's portal, not the agency's.`, lastSyncAt: new Date().toISOString() };
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
        properties: [
          "email", "lifecyclestage", "jobtitle", "industry", "country",
          "hs_analytics_source", "hs_analytics_source_data_1", "hs_analytics_source_data_2",
          "hs_analytics_first_touch_converting_campaign", "hs_google_click_id", "hs_facebook_click_id", "hs_linkedin_click_id",
          "hs_v2_date_entered_lead", "hs_v2_date_entered_marketingqualifiedlead", "hs_v2_date_entered_salesqualifiedlead", "hs_v2_date_entered_opportunity", "hs_v2_date_entered_customer",
        ],
        limit: 100,
        after,
      };
      const page = await this.request<{ results: Array<{ id: string; properties: Record<string, string | null> }>; paging?: { next?: { after: string } } }>("/crm/v3/objects/contacts/search", { method: "POST", body: JSON.stringify(body) });
      for (const c of page.results) {
        const p = c.properties;
        for (const [hsStage, stage] of Object.entries(stageMap)) {
          const at = p[`hs_v2_date_entered_${hsStage}`];
          if (!at) continue;
          const ts = new Date(at).getTime();
          if (ts < from || ts > to) continue;
          events.push({
            externalContactId: c.id,
            email: p.email ?? undefined,
            stage,
            occurredAt: new Date(ts).toISOString(),
            // Drill-down 2 holds the campaign/ad-group label for PAID_SEARCH / PAID_SOCIAL originals.
            campaignName: p.hs_analytics_first_touch_converting_campaign ?? p.hs_analytics_source_data_2 ?? undefined,
            source: p.hs_analytics_source ?? undefined,
            jobTitle: p.jobtitle ?? undefined,
            industry: p.industry ?? undefined,
            country: p.country ?? undefined,
            clickIds: { google: p.hs_google_click_id ?? undefined, meta: p.hs_facebook_click_id ?? undefined, linkedin: p.hs_linkedin_click_id ?? undefined },
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
        properties: ["dealname", "amount", "amount_in_home_currency", "dealstage", "closedate", "hs_is_closed_won", "hs_is_closed_lost", "hs_analytics_source", "hs_analytics_source_data_2"],
        limit: 100,
        after,
      };
      const page = await this.request<{ results: Array<{ id: string; properties: Record<string, string | null>; associations?: unknown }>; paging?: { next?: { after: string } } }>("/crm/v3/objects/deals/search", { method: "POST", body: JSON.stringify(body) });
      for (const d of page.results) {
        const p = d.properties;
        const won = p.hs_is_closed_won === "true";
        const lost = p.hs_is_closed_lost === "true";
        events.push({
          externalContactId: `deal:${d.id}`,
          stage: won ? "closed_won" : lost ? "closed_lost" : "opportunity",
          occurredAt: new Date(won && p.closedate ? p.closedate : (p.closedate ?? new Date(from).toISOString())).toISOString(),
          amount: p.amount_in_home_currency ? Number(p.amount_in_home_currency) : p.amount ? Number(p.amount) : undefined,
          campaignName: p.hs_analytics_source_data_2 ?? undefined,
          source: p.hs_analytics_source ?? undefined,
        });
      }
      after = page.paging?.next?.after;
    } while (after);

    return events;
  }
}

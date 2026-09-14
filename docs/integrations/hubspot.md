# HubSpot — portal audit

**Verified:** 2026-09-14 through the HubSpot MCP connection available in this workspace.

## Finding: the connected portal is the agency CRM, not SketchDeck's

| | |
| --- | --- |
| Portal | **BOM Growth** (account 23696525) |
| Currency / timezone | CAD · America/Edmonton |
| Deal pipeline | Sales Pipeline: New Lead → Discovery call booked → Proposal Requested → Proposal sent → Closed won / lost |
| Contacts matching "sketchdeck" | 13 — SketchDeck **employees** (source OFFLINE / Gmail extension), lifecycle "lead" |
| Contacts with original source Paid Search or Paid Social | **0** |

SketchDeck's paid-media leads (the `hubspot_form_submit` / `hubspot_meeting_success` events seen in GA4) live in **SketchDeck's own HubSpot portal**, which is not connected here. AdPilot's HubSpot connector must be pointed at that portal with its own private-app token (`HUBSPOT_ACCESS_TOKEN`), scopes `crm.objects.contacts.read`, `crm.objects.deals.read`, `crm.objects.companies.read`.

## Verified schema (standard HubSpot, identical across portals)

- Lifecycle stage enum: subscriber, lead, marketingqualifiedlead, salesqualifiedlead, opportunity, customer, evangelist, other.
- Stage-entry timestamps: `hs_v2_date_entered_lead`, `hs_v2_date_entered_marketingqualifiedlead`, `hs_v2_date_entered_salesqualifiedlead`, `hs_v2_date_entered_opportunity`, `hs_v2_date_entered_customer` (datetime). The `hs_lifecyclestage_*_date` names do **not** exist.
- Attribution: `hs_analytics_source` (PAID_SEARCH, PAID_SOCIAL, …), `hs_analytics_source_data_1` / `_2` (campaign / ad-group drill-down), `hs_analytics_first_touch_converting_campaign`, `hs_google_click_id`, `hs_facebook_click_id`, `hs_linkedin_click_id`.
- Deals: `amount_in_home_currency`, `dealstage`, `pipeline`, `closedate`, `hs_is_closed_won`, `hs_is_closed_lost`, `hs_analytics_source`. (`hs_campaign` does not exist on deals.)

The connector in `integrations/hubspot/connector.ts` uses exactly these names.

## Attribution approach in AdPilot

1. Deterministic: match `hs_google_click_id` / `hs_facebook_click_id` / `hs_linkedin_click_id` to the platform click (best).
2. Campaign label: `hs_analytics_first_touch_converting_campaign` or `hs_analytics_source_data_2` matched to the campaign name (works today because SketchDeck's GA4/UTM campaign names equal the Google Ads campaign names).
3. Fallback: channel-level allocation by `hs_analytics_source`.

## Verifying a token locally

The sandbox that built AdPilot cannot reach `api.hubapi.com` (egress policy), so verify on your machine:

```bash
# .env.local (git-ignored):  HUBSPOT_ACCESS_TOKEN=<private app token>
npm run hubspot:verify
```

It prints the portal id/currency/timezone, the last 90 days of funnel events by stage and source, the top campaign labels, and how many events attribute to the Google Ads campaign names. Nothing is stored. If a token was ever pasted into a chat or ticket, rotate it in HubSpot → Settings → Integrations → Private Apps.

## How events become funnel metrics (hourly scan)

`integrations/attribution.ts`: campaign-name match → channel fallback (click id or original source, credited to the day's highest-spend campaign on that platform) → unattributed (counted, never invented). The scan writes MQL/SQL/opportunity/pipeline/revenue onto `performance_metrics` campaign-day rows and records the match rates in the integration status.

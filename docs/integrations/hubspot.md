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

SketchDeck's paid-media leads (the `hubspot_form_submit` / `hubspot_meeting_success` events seen in GA4) live in **SketchDeck's own HubSpot portal**, which is not connected here. AdPilot's HubSpot connector must be pointed at that portal with the HubSpot Service Key created for AdPilot AI - SketchDeck (`HUBSPOT_ACCESS_TOKEN`), scopes `crm.objects.contacts.read`, `crm.objects.deals.read`, `crm.objects.companies.read`.

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

## Verifying the Service Key

The sandbox that built AdPilot cannot reach `api.hubapi.com` (egress policy). Verify from the deployed app — no terminal needed:

```
https://<your-vercel-domain>/api/integrations/hubspot/verify?key=<CRON_SECRET>
```

(or locally with `HUBSPOT_ACCESS_TOKEN` in `.env.local` and `npm run hubspot:verify`). It returns the portal id/currency/timezone, the last 90 days of funnel events by stage and source, the top campaign labels, and how many events attribute to the Google Ads campaign names. Nothing is stored. If the key was ever pasted into a chat or ticket, rotate it in HubSpot and update the Vercel environment variable.

## How events become funnel metrics (hourly scan)

`integrations/attribution.ts`: campaign-name match → channel fallback (click id or original source, credited to the day's highest-spend campaign on that platform) → unattributed (counted, never invented). For paid social, HubSpot's drill-down 1 (the network, e.g. `linkedin`) decides the platform. The scan writes MQL/SQL/opportunity/pipeline/revenue onto `performance_metrics` campaign-day rows and records the match rates in the integration status.

**Ad platforms synced only into HubSpot (e.g. LinkedIn Ads via HubSpot's Ads tool).** HubSpot's API exposes the contact-level attribution (network, campaign label, `li_fat_id`) but not the campaign's spend, impressions, or clicks. When a paid-social event names a campaign no ad connector has supplied, the scan creates that campaign as a **spend-less placeholder** (`source = hubspot`, channel type "Via HubSpot (no spend data)") so the leads, MQLs, SQLs, pipeline, and revenue it produced are visible on the dashboard. Cost metrics for those campaigns show "—" rather than a misleading $0. Connect the platform itself (LinkedIn Ads in NotFair, or the direct Marketing API) to get spend; placeholders are not created for platforms an ad connector scans.

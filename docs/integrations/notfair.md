# NotFair MCP — capability audit

**Verified:** 2026-09-14 against the live NotFair MCP connection in the SketchDeck workspace.
**Status:** NotFair is already connected. AdPilot treats it as a primary live data source for Google Ads and GA4.

## 1. What the MCP exposes

Three tools:

| Tool | Purpose |
| --- | --- |
| `search({ query, platform? })` | Discovers capability ids, their exact JSON input schemas, safety annotations, and the workspace's connected platforms. |
| `executeRead({ capabilityId, arguments })` | Runs a read-only capability. |
| `execute({ capabilityId, arguments })` | Runs a write capability (changes the live ad account). |

125 capabilities in total across Google Ads, Meta, X, LinkedIn, Reddit, TikTok, Search Console, GA4, GoHighLevel and WordPress.

**Connected in the SketchDeck workspace at verification time:**

- `google_ads` — account **2175229247 "SketchDeck.AI"** (USD, America/Edmonton), authorized by `m***@bomgrowth.com`
- `google_analytics` — property **properties/454640302**

Not connected (NotFair reports `"<platform> is not connected in this workspace"`): Meta, LinkedIn, X, Reddit, TikTok, **Search Console**, GoHighLevel, WordPress.

## 2. What data is available (verified by running it)

### Campaigns (`google_ads_summarizeAccountSetup`, `google_ads_runScript` GAQL)

4 campaigns (3 enabled Search + 1 paused):

| Campaign | Status | Bidding | Daily budget |
| --- | --- | --- | --- |
| USA,CA \| Core Phrases \| Search \| [tCPA $600] | ENABLED | MAXIMIZE_CONVERSIONS (tCPA $600) | $120 |
| USA,CA \| Search \| Brand \| [mCPC] | ENABLED | MANUAL_CPC | $20 |
| USA,CA \| Search \| Competitors \| [tCPA $600] | ENABLED | MAXIMIZE_CONVERSIONS (tCPA $600) | $20 |
| pilot-campaign \| search \| sketchdeck.ai \| $1000/m | PAUSED | TARGET_SPEND | $50 |

Fields: id, name, status, channel type, bidding strategy, budget, start date, plus metrics (cost_micros with a `cost_value` sibling in dollars, impressions, clicks, ctr, average_cpc, conversions, conversions_value, all_conversions, search_impression_share). Daily segmentation via `segments.date` works (verified for a 14-day range).

### Ads / creatives (`ad_group_ad` GAQL)

11 Responsive Search Ads with: ad id, ad group id/name, campaign id/name, status, policy approval status, `final_urls`, all headlines and descriptions with per-asset `asset_performance_label` (PENDING / LEARNING / GOOD / BEST). No `image_ad`, `responsive_display_ad` or `video_ad` rows exist in the account today.

### Creative assets (`asset` GAQL)

The asset library contains IMAGE assets with **real, directly loadable URLs** (`https://tpc.googlesyndication.com/simgad/…`) plus width/height/MIME type, e.g. `SD-ID-logo-Colour.png` (2595×834) and several 768×768 / 1024×1024 JPEGs. Zero YouTube video assets. Sitelinks (Product, About, Customer Stories, Book A Demo, …) and callouts (95%+ Accuracy, 80% Avg Time Reduction, Free Trial Available, …) are available as text.

`google_ads_getAssetLinks` returns where an asset is linked (customer / campaign / ad group / asset group).

**Ad → creative → asset workflow:** `ad_group_ad` gives the ad and its text assets; for display/video ads the `marketing_images[].asset` / `video.asset` resource names resolve against the `asset` table for the media URL. There is **no ad-preview renderer** in the MCP. AdPilot renders RSA text previews itself and shows real image-asset URLs when available; otherwise it displays "Creative unavailable".

### Conversion actions

13 conversion actions; primary for goal: **Booked demo meeting**, **Contact page form**, **Calls from ads**. Last 30 days by campaign: Core Phrases 1 booked demo; Competitors 1 email click + 2 phone clicks; Brand 1 booked demo.

### GA4 (`google_analytics_runScript`)

Key events configured: `hubspot_meeting_success`, `hubspot_form_submit`, `email_clicks`, `phone_click`, `purchase`. Source/medium/campaign reports work and expose LinkedIn paid-social campaign names (e.g. `OCT+2025+Ads+|+SketchDeck`, `Impactable+MOF+Ad+Group+|+2026`) even though LinkedIn Ads itself is not connected — useful for session/lead attribution.

## 3. Performance data

Spend, impressions, clicks, CTR, CPC, conversions, conversion value, all_conversions, impression share; daily granularity; account currency USD. **Not available from NotFair:** MQL, SQL, opportunity, pipeline, revenue — these come from the CRM (HubSpot) and are joined by campaign/click attribution inside AdPilot.

## 4. Actions the MCP can perform (all gated by AdPilot approval)

| Capability | Effect |
| --- | --- |
| `google_ads_updateCampaignBudget` | Set daily budget (respects NotFair guardrails; default max change 50%) |
| `google_ads_pauseCampaign` / `enableCampaign` | Pause / re-enable a campaign |
| `google_ads_updateAdGroup` | Pause/enable ad group; bid / target-CPA overrides |
| `google_ads_updateCampaignBidding` | Change bidding strategy |
| `google_ads_setGuardrails` / `getGuardrails` | NotFair's own limits (max bid/budget change %, monthly cap) |
| `google_ads_mutate`, `createCampaign`, asset tools… | Generic writes — not used by AdPilot |

Post-write verification: `google_ads_getChanges` (NotFair change log) and `google_ads_reviewChangeImpact` (before/after 7-day averages, correlational) support the MEASURE step.

## 5. Limitations

- Only Google Ads and GA4 are connected. Meta and LinkedIn are supported by NotFair but must be connected in the NotFair workspace before AdPilot can read them through it.
- Search Console is not connected → search-opportunity insights are reported as unavailable.
- MCP tool results are JSON text blocks; `runScript` has a 45s / 500KB cap. AdPilot batches with `gaqlParallel` and windows date ranges.
- No ad-preview rendering; creative images come from the asset library only.
- Writes always require a named approver in AdPilot **and** obey NotFair guardrails.

## 6. How AdPilot connects at runtime

NotFair's public integration is MCP over Streamable HTTP secured with **OAuth 2.1 (authorization code + PKCE); NotFair issues no API keys**.

### Primary path: authorize from the browser (no terminal needed)

Once `NOTFAIR_MCP_URL` and `ADPILOT_ORGANIZATION_ID` are set in Vercel and the app is deployed:

1. Sign in to the deployed app and open **Integrations**.
2. Click **Connect NotFair**. This hits `GET /api/integrations/notfair/authorize`, which discovers NotFair's authorization server, dynamically registers AdPilot as an OAuth client (once — the registration is reused after), builds a PKCE authorization URL, and redirects your browser to NotFair.
3. Approve access in NotFair. It redirects back to `GET /api/integrations/notfair/callback`, which exchanges the code for tokens and stores them in the `integration_secrets` table (service-role only — never exposed to the browser or any client bundle).
4. The Integrations page shows a "NotFair connected" banner and the health check turns 🟢.

This requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to be set (the token store lives in Postgres, since the authorize and callback steps run as two separate serverless requests with nothing else to share state). Implementation: `integrations/notfair/oauth.ts` (`SupabaseTokenStore`, `notFairClientMetadata`), `app/api/integrations/notfair/authorize/route.ts`, `app/api/integrations/notfair/callback/route.ts`.

### Alternative: CLI authorization (local development only)

For local development with a terminal and browser on the same machine:

```bash
# .env.local:  NOTFAIR_MCP_URL=https://notfair.co/api/mcp/google_ads
npm run notfair:auth
# → prints NOTFAIR_OAUTH_CLIENT and NOTFAIR_OAUTH_TOKENS to store as env vars
#   (or writes them to integration_secrets with NOTFAIR_TOKEN_STORE=supabase)
```

`integrations/notfair/client.ts` uses `NOTFAIR_OAUTH_TOKENS` when present (env-based store) and falls back to `NOTFAIR_API_KEY` as a bearer token if NotFair ever issues one. In production, the browser flow above and the CLI flow both end up writing to the same `integration_secrets` table when `NOTFAIR_TOKEN_STORE=supabase` — either one works; the browser flow is the one that needs no local terminal.

**Endpoint note:** public references show per-platform endpoints of the form `https://notfair.co/api/mcp/<platform>` (e.g. `meta_ads`). Confirm the exact Google Ads / GA4 endpoint in the NotFair workspace; this sandbox could not reach notfair.co to verify the discovery documents. Until authorization completes, the integration reports `not_configured` and no live data is claimed.

# Deployment

AdPilot AI deploys to **Vercel** (web app, API routes, cron jobs) with **Supabase** (Postgres + auth) for live mode. No local terminal is required for any step below; everything is done in the Vercel and Supabase dashboards and verified from a browser.

## 1. Create the Vercel project

1. Vercel dashboard → **Add New… → Project** → import `Matt-BomGrowth/Sketchdeck.ai`.
2. Framework preset: **Next.js** (auto-detected). Node.js version: **22** (Settings → General → Node.js Version).
3. Production branch: `main` once this work is merged; until then choose the branch `claude/great-goodall-xmp3c4` under Settings → Git → Production Branch, or simply deploy it as a Preview.
4. Click **Deploy**. The first deployment runs in demo mode (🟡 DEMO DATA) and needs no secrets.

## 2. Environment variables — exactly where to enter them

Vercel dashboard → your project → **Settings** (top tab) → **Environment Variables** (left sidebar).

For each variable: **Key**, **Value**, tick the **Environments** it applies to (Production, Preview, Development), optionally mark it **Sensitive** (recommended for every credential — the value is write-only afterwards), then **Save**.

> Environment variables are read at build/boot time. After adding or changing one, trigger a new deployment: **Deployments** tab → latest deployment → **⋯** → **Redeploy**.

### HubSpot Service Key (AdPilot AI - SketchDeck)

| Key | Value | Environments | Sensitive |
| --- | --- | --- | --- |
| `HUBSPOT_ACCESS_TOKEN` | the HubSpot Service Key created for AdPilot AI - SketchDeck | Production (and Preview if you want preview deployments to read HubSpot) | Yes |

The key is read server-side only (`integrations/hubspot/connector.ts`), is never sent to the browser, never logged, and is not present anywhere in the repository (CI runs `npm run check:secrets` on every push).

### Everything else

| Key | Purpose | When |
| --- | --- | --- |
| `CRON_SECRET` | Protects `/api/cron/*` and the verification endpoint. Any random string of 32+ characters. | Now |
| `DATA_MODE` | `demo` (public demo) or `live` (authenticated, real integrations) | Now: `demo`; `live` once Supabase + NotFair are set |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADPILOT_ORGANIZATION_ID` | Auth + database | Before switching to `live` |
| `NOTFAIR_MCP_URL`, `NOTFAIR_OAUTH_CLIENT`, `NOTFAIR_OAUTH_TOKENS` | NotFair MCP (Google Ads + GA4) — see docs/integrations/notfair.md | Before switching to `live` |
| `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AD_ACCOUNT_ID` | Additional ad platforms | When available |
| `EMAIL_PROVIDER`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, `DAILY_BRIEF_RECIPIENTS` | Daily brief email | Optional |

`.env.example` lists every variable with comments. Local development can use `.env.local` (git-ignored, blocked by the pre-commit hook); production values live only in Vercel.

## 3. Verify HubSpot from the browser (after redeploy)

Open:

```
https://<your-vercel-domain>/api/integrations/hubspot/verify?key=<CRON_SECRET>
```

The JSON report never contains the key. Read it like this:

- `portal.portalId` — must **not** be `23696525` (that is the BOM Growth agency CRM). `portal.isAgencyPortal` says it directly.
- `events.bySource.PAID_SEARCH` / `PAID_SOCIAL` — paid-media funnel events in the last 90 days. Zero means the wrong portal or HubSpot is not attributing paid traffic on sketchdeck.ai.
- `attribution` — how many events map to the Google Ads campaign names (by name, by channel fallback, unattributed).
- `verdict` — plain-language summary; `ok: true` means AdPilot can use this portal.

Add `&days=30` to change the window. When authentication is enforced (`DATA_MODE=live`), a signed-in non-viewer user can open the URL without the key.

If the key was ever shared in a chat or ticket, rotate it in HubSpot, update the value in Vercel → Settings → Environment Variables, and redeploy.

## 4. Supabase (for live mode)

1. Create a Supabase project; copy Project URL, anon key and service-role key into the Vercel variables above; copy the connection string to `DATABASE_URL`.
2. Apply `database/migrations/*.sql` in order (Supabase SQL editor, or `npm run db:migrate` from any machine with `DATABASE_URL`).
3. Insert the organization row and add users to `users (id, organization_id, email, role)` with their Supabase auth ids; put the organization id in `ADPILOT_ORGANIZATION_ID`.
4. Optional: `npm run db:seed` loads the SketchDeck demo dataset (rows tagged `source='demo'`).

## 5. Cron

`vercel.json` schedules `/api/cron/daily-brief` at 13:00 UTC and `/api/cron/hourly-scan` at 12:00 UTC (**once daily**, not hourly). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.

**Why the scan isn't actually hourly by default:** Vercel's free **Hobby** plan restricts cron jobs to at most once per day per job — a genuinely hourly schedule (`0 * * * *`) is rejected at deploy time with "Hobby accounts are limited to daily cron jobs," and the deployment never completes. The `/api/cron/hourly-scan` endpoint itself has no such limit; only Vercel's own Hobby-plan scheduler does. Two ways to get real hourly cadence:

- **Upgrade the Vercel project to the Pro plan**, then change the schedule back to `"0 * * * *"` in `vercel.json`.
- **Keep Hobby and drive the endpoint from GitHub Actions instead** (free, supports finer-grained schedules):

  ```yaml
  # .github/workflows/hourly-scan.yml
  on:
    schedule: [{ cron: "0 * * * *" }]
  jobs:
    scan:
      runs-on: ubuntu-latest
      steps:
        - run: curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://<your-vercel-domain>/api/cron/hourly-scan
  ```

  Add `CRON_SECRET` as a GitHub Actions secret with the same value as in Vercel, then this workflow calls the endpoint every hour regardless of Vercel's own cron plan limits.

## 6. Recommended project layout

Two Vercel projects from the same repository: a **public demo** (`DATA_MODE=demo`, no Supabase, no credentials) and the **customer app** (`DATA_MODE=live`, authentication enforced, all credentials). Live customer data is never served through an unauthenticated route.

## Go-live checklist

- [ ] `HUBSPOT_ACCESS_TOKEN` set (Production, Sensitive) and `/api/integrations/hubspot/verify` returns `ok: true`
- [ ] `CRON_SECRET` set
- [ ] NotFair OAuth material set and `/integrations` shows 🟢 Connected
- [ ] Supabase configured, migrations applied, organization + users created
- [ ] `DATA_MODE=live`, redeployed, sign-in works
- [ ] Automation policy reviewed in Settings (auto-execute is OFF by default)

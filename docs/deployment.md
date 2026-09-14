# Deployment

## Vercel (web + API + cron)

1. Import the repository in Vercel. Framework: Next.js. Node 22.
2. Set environment variables (Production and Preview separately):
   - `DATA_MODE=live` (Production) / `DATA_MODE=demo` (Preview or a public demo project)
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADPILOT_ORGANIZATION_ID`
   - `NOTFAIR_MCP_URL`, `NOTFAIR_API_KEY`
   - `HUBSPOT_ACCESS_TOKEN`, `META_*`, `LINKEDIN_*` as they become available
   - `CRON_SECRET` (random 32+ chars), `EMAIL_PROVIDER`, `EMAIL_PROVIDER_API_KEY`, `DAILY_BRIEF_RECIPIENTS`
3. `vercel.json` schedules `/api/cron/hourly-scan` hourly and `/api/cron/daily-brief` daily at 13:00 UTC. Vercel sends `Authorization: Bearer $CRON_SECRET`.
4. Recommended: two Vercel projects from the same repo — a **public demo** (`DATA_MODE=demo`, no Supabase) and the **customer app** (`DATA_MODE=live`, auth required). Live customer data is never served without authentication.

## Supabase (Postgres + auth)

1. Create a project; copy the connection string to `DATABASE_URL` and the API keys to the variables above.
2. `npm run db:migrate` applies `database/migrations/*.sql` (schema, indexes, RLS).
3. Create the organization row and add users: insert into `organizations`, then into `users (id, organization_id, email, role)` with the Supabase auth user id.
4. Optional: `npm run db:seed` loads the SketchDeck demo dataset (rows tagged `source='demo'`) to exercise live-mode infrastructure.

## Alternative schedulers

Any scheduler can call the cron endpoints with the bearer secret, e.g. GitHub Actions:

```yaml
on:
  schedule: [{ cron: "0 * * * *" }]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://<app>/api/cron/hourly-scan
```

Or run the jobs directly: `npm run scan`, `npm run brief` (use the service role variables).

## Checklist before going live

- [ ] `DATA_MODE=live` and Supabase configured (the proxy fails closed otherwise)
- [ ] `CRON_SECRET` set
- [ ] NotFair MCP URL/token verified via `/integrations` (🟢 Connected)
- [ ] HubSpot token added so MQL/SQL/pipeline attribution can be populated
- [ ] Automation policy reviewed in Settings (auto-execute is OFF by default)

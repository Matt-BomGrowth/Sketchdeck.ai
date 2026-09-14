# Architecture

```
Ad platforms (Google via NotFair MCP · Meta · LinkedIn)   CRM (HubSpot)   Analytics (GA4 via NotFair)
                 │                                             │                    │
                 └──────────── integrations/* (independent connectors) ────────────┘
                                              │ normalized rows
                                   jobs/hourly-scan  →  PostgreSQL (Supabase, RLS)
                                              │
                          lib/analytics/snapshot.ts  (one analysis for a window)
        ┌───────────────┬───────────────┬───────────────┬───────────────┬────────────────┐
   calculations     detectors        analyzers       optimizers      recommendations   actions
   (CTR…pROAS)   (fatigue, anomaly) (health, why,   (budget plan,   (next best action, (policy,
                                     lead quality,   simulator)      exec. summary)     approval
                                     ICP, creative)                                     workflow)
                                              │
                               app/(app)/* server components (Next.js 16)
```

## Principles

- **Demo and live are never mixed.** `DATA_MODE` selects a `DataRepository`; the UI shows 🟡 DEMO DATA or 🟢 LIVE DATA persistently.
- **No fabricated data.** Connectors throw on failure; integration health is independent; creatives without accessible media show "Creative unavailable".
- **Pipeline over clicks.** Health score weights pipeline ROAS, cost per SQL, SQL rate and opportunity rate ~60%; CTR is 5%.
- **Approval by default.** Every recommendation that changes a live account is `requiresApproval` unless the organization enables auto-execution and the change is inside every limit (`agent/actions/policy.ts`).
- **Explainability.** Recommendations carry What happened / Why / Action / Expected impact / Confidence; the optimization log records before/after/actual impact/approver.

## Key modules

| Path | Responsibility |
| --- | --- |
| `types/domain.ts` | Normalized model (campaigns, daily metrics, creatives, recommendations, actions, scan runs…) |
| `lib/calculations` | Total, zero-safe metric functions and the funnel |
| `agent/detectors` | Fatigue (0–100, configurable thresholds) and robust-z anomaly detection |
| `agent/analyzers` | Health score, why-did-performance-change, lead quality, ICP, creative → pipeline, insights |
| `agent/optimizers` | Top-3 / bottom-30% budget plan; what-if simulator with diminishing returns |
| `agent/recommendations` | Next best actions; data-generated executive summary |
| `agent/actions` | Policy, OBSERVE→RECOMMEND→APPROVE→EXECUTE→MEASURE state machine, executors |
| `lib/analytics/snapshot.ts` | Runs everything for a window; pages and jobs consume it |
| `lib/data` | `DataRepository` interface; in-memory demo repo; Supabase live repo |
| `integrations/*` | Connector per platform; `notfair/` is verified against the live MCP |
| `jobs/*` | Hourly scan and daily brief (callable from cron routes or CLI) |
| `database/` | SQL migrations (schema + RLS), migration runner, demo seed |

## Data flow for a live scan

1. `jobs/hourly-scan` iterates configured ad connectors; each failure is recorded in `scan_runs.errors` without stopping others.
2. Normalized campaigns/metrics/creatives are upserted (`performance_metrics` keyed by entity + date).
3. `loadSnapshot` reads the window plus baselines and runs the full analysis.
4. Recommendations are stored with a `dedupe_key` so a pending recommendation is not duplicated hourly.
5. The dashboard reads fresh data on request (no caching of live customer data).

## Security

- Server-only secrets; nothing provider-related reaches the browser (`NEXT_PUBLIC_*` is limited to the Supabase URL/anon key).
- `proxy.ts` requires a Supabase session on every app route in live mode (fails closed if Supabase is unconfigured).
- Row-level security scopes every table to the user's organization; jobs use the service role with an explicit `ADPILOT_ORGANIZATION_ID`.
- Cron routes require `CRON_SECRET`. Approvals require a non-viewer role. All decisions and settings changes are written to `audit_logs`.

/**
 * Seed a PostgreSQL database with the SketchDeck demo dataset so LIVE-mode
 * infrastructure (Supabase, RLS, jobs) can be exercised before real
 * integrations are connected. Rows are tagged source='demo'.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { Client } from "pg";
import { getDemoDataset } from "@/data/demo";
import { buildDemoHistory } from "@/data/demo/history";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required (see .env.example)");
  const client = new Client({ connectionString: url, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  const ds = getDemoDataset();
  const history = buildDemoHistory(ds);

  await client.query("begin");
  try {
    const org = await client.query(
      `insert into organizations (name, slug, currency, timezone) values ($1, $2, $3, $4)
       on conflict (slug) do update set name = excluded.name returning id`,
      [ds.organization.name, ds.organization.slug, ds.organization.currency, ds.organization.timezone],
    );
    const orgId: string = org.rows[0].id;
    await client.query(`insert into org_settings (organization_id) values ($1) on conflict do nothing`, [orgId]);

    const campaignIds = new Map<string, string>();
    for (const c of ds.campaigns) {
      const r = await client.query(
        `insert into campaigns (organization_id, platform, external_id, name, status, objective, daily_budget, currency, country, industry, icp_segment, channel_type, started_at, source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'demo')
         on conflict (organization_id, platform, external_id) do update set name = excluded.name, status = excluded.status, daily_budget = excluded.daily_budget
         returning id`,
        [orgId, c.platform, c.externalId, c.name, c.status, c.objective, c.dailyBudget, c.currency, c.country, c.industry, c.icpSegment, c.channelType, c.startedAt],
      );
      campaignIds.set(c.id, r.rows[0].id);
    }

    const creativeIds = new Map<string, string>();
    for (const cr of ds.creatives) {
      const r = await client.query(
        `insert into creatives (organization_id, campaign_id, platform, external_id, name, type, status, headline, primary_text, description, cta, landing_url, asset_status, test_group, variant)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'demo',$13,$14)
         on conflict (organization_id, platform, external_id) do update set name = excluded.name returning id`,
        [orgId, campaignIds.get(cr.campaignId), cr.platform, cr.externalId, cr.name, cr.type, cr.status, cr.headline, cr.primaryText, cr.description ?? null, cr.cta ?? null, cr.landingUrl ?? null, cr.testGroup ?? null, cr.variant ?? null],
      );
      creativeIds.set(cr.id, r.rows[0].id);
    }

    const insertMetric = async (entityType: string, entityId: string, m: { date: string; spend: number; impressions: number; clicks: number; leads: number; mqls: number; sqls: number; opportunities: number; pipeline: number; revenue: number; frequency?: number }) => {
      await client.query(
        `insert into performance_metrics (organization_id, entity_type, entity_id, date, spend, impressions, clicks, leads, mqls, sqls, opportunities, pipeline, revenue, frequency, source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'demo')
         on conflict (entity_type, entity_id, date) do update set spend = excluded.spend, impressions = excluded.impressions, clicks = excluded.clicks, leads = excluded.leads, mqls = excluded.mqls, sqls = excluded.sqls, opportunities = excluded.opportunities, pipeline = excluded.pipeline, revenue = excluded.revenue, frequency = excluded.frequency`,
        [orgId, entityType, entityId, m.date, m.spend, m.impressions, m.clicks, m.leads, m.mqls, m.sqls, m.opportunities, m.pipeline, m.revenue, m.frequency ?? null],
      );
    };
    for (const m of ds.dailyMetrics) await insertMetric("campaign", campaignIds.get(m.campaignId)!, m);
    for (const m of ds.creativeDailyMetrics) await insertMetric("creative", creativeIds.get(m.creativeId)!, m);

    for (const s of ds.audienceSegments) {
      await client.query(
        `insert into audience_segment_metrics (organization_id, window_start, window_end, dimension, value, spend, impressions, clicks, leads, mqls, sqls, opportunities, pipeline, revenue)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (organization_id, window_start, window_end, dimension, value) do update set spend = excluded.spend, pipeline = excluded.pipeline, sqls = excluded.sqls`,
        [orgId, ds.startDate, ds.endDate, s.dimension, s.value, s.spend, s.impressions, s.clicks, s.leads, s.mqls, s.sqls, s.opportunities, s.pipeline, s.revenue],
      );
    }

    for (const run of history.scanRuns) {
      await client.query(
        `insert into scan_runs (organization_id, started_at, finished_at, platforms_scanned, campaigns_scanned, issues_detected, recommendations_created, actions_executed, errors, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [orgId, run.startedAt, run.finishedAt, run.platformsScanned, run.campaignsScanned, run.issuesDetected, run.recommendationsCreated, run.actionsExecuted, JSON.stringify(run.errors), run.status],
      );
    }
    for (const a of history.actions) {
      await client.query(
        `insert into optimization_actions (organization_id, platform, campaign_id, campaign_name, action_type, before_value, after_value, reason, expected_impact, actual_impact, approver, status, created_at, executed_at, measured_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [orgId, a.platform, campaignIds.get(a.campaignId) ?? null, a.campaignName, a.actionType, a.before, a.after, a.reason, a.expectedImpact, a.actualImpact ?? null, a.approver ?? null, a.status, a.createdAt, a.executedAt ?? null, a.measuredAt ?? null],
      );
    }
    await client.query("commit");
    console.log(`seeded organization ${orgId}: ${ds.campaigns.length} campaigns, ${ds.dailyMetrics.length} campaign-days, ${ds.creatives.length} creatives`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

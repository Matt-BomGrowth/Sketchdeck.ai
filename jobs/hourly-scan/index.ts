/**
 * Hourly scanner.
 *
 *  1. Fetch platform data   6. Detect fatigue          11. Record scan
 *  2. Normalize             7. Evaluate campaigns      12. Update dashboard (data is read fresh)
 *  3. Store metrics         8. Evaluate audiences
 *  4. Calculate KPIs        9. Evaluate creatives
 *  5. Detect anomalies     10. Generate recommendations
 *
 * In DEMO mode steps 1–3 are skipped (data is generated) and 4–12 run on the
 * demo dataset. In LIVE mode each integration is fetched independently; a
 * failure is recorded and the scan continues with the other platforms.
 */

import type { DataRepository } from "@/lib/data/repository";
import type { Platform, ScanRun } from "@/types/domain";
import { adPlatformConnectors, analyticsConnectors, checkAllIntegrations, crmConnectors, searchConnectors } from "@/integrations/registry";
import { attributeFunnelEvents, derivedSocialCampaigns, spendIndex } from "@/integrations/attribution";
import { crmFunnelDaily } from "@/integrations/crm-funnel";
import type { NormalizedCampaignMetric } from "@/integrations/types";
import { loadSnapshot } from "@/lib/analytics/load-snapshot";
import { newId } from "@/lib/utils/id";
import { windowEnding } from "@/lib/utils/dates";

export interface ScanOptions {
  windowDays?: number;
  /** Days of history to (re)fetch from platforms in live mode. */
  fetchDays?: number;
  now?: Date;
  log?: (msg: string) => void;
}

export async function runHourlyScan(repo: DataRepository, options: ScanOptions = {}): Promise<ScanRun> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => undefined);
  const run: ScanRun = {
    id: newId(),
    organizationId: (await repo.getOrganization()).id,
    startedAt: now.toISOString(),
    platformsScanned: [],
    campaignsScanned: 0,
    issuesDetected: 0,
    recommendationsCreated: 0,
    actionsExecuted: 0,
    errors: [],
    status: "running",
  };
  await repo.saveScanRun(run);

  // 1–3. Fetch, normalize, store (live only).
  if (repo.mode === "live") {
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const range = windowEnding(yesterday.toISOString().slice(0, 10), options.fetchDays ?? 35);
    const allMetrics: NormalizedCampaignMetric[] = [];
    const externalToId = new Map<string, string>();
    for (const connector of adPlatformConnectors()) {
      if (!connector.isConfigured()) {
        log(`skip ${connector.name}: not configured`);
        continue;
      }
      try {
        log(`fetch ${connector.name}`);
        const campaigns = await connector.fetchCampaigns();
        const ids = await repo.upsertCampaigns(campaigns, connector.key);
        const metrics = await connector.fetchDailyMetrics({ start: range.start, end: range.end });
        const stored = await repo.upsertDailyMetrics(metrics, ids, connector.key);
        allMetrics.push(...metrics);
        for (const [k, v] of ids) externalToId.set(k.split(":").slice(1).join(":"), v);
        let creativesStored = 0;
        try {
          const creatives = await connector.fetchCreatives();
          const creativeIds = await repo.upsertCreatives(creatives, ids, connector.key);
          creativesStored = creativeIds.size;
          if (connector.fetchCreativeDailyMetrics) {
            const cm = await connector.fetchCreativeDailyMetrics({ start: range.start, end: range.end });
            await repo.upsertCreativeDailyMetrics(cm, creativeIds, connector.key);
          }
        } catch (err) {
          run.errors.push(`${connector.name} creatives: ${errMsg(err)}`);
        }
        // Search detail (keywords + search terms) for the Google Ads section; a
        // failure here never blocks campaign-level data.
        if (connector.fetchKeywordDailyMetrics) {
          try {
            const kw = await connector.fetchKeywordDailyMetrics({ start: range.start, end: range.end });
            const n = await repo.upsertKeywordDailyMetrics(kw, ids, connector.key);
            log(`${connector.name}: ${n} keyword-day rows`);
          } catch (err) {
            run.errors.push(`${connector.name} keywords: ${errMsg(err)}`);
          }
        }
        if (connector.fetchSearchTermDailyMetrics) {
          try {
            const st = await connector.fetchSearchTermDailyMetrics({ start: range.start, end: range.end });
            const n = await repo.upsertSearchTermDailyMetrics(st, ids, connector.key);
            log(`${connector.name}: ${n} search-term-day rows`);
          } catch (err) {
            run.errors.push(`${connector.name} search terms: ${errMsg(err)}`);
          }
        }
        for (const p of connector.platforms) if (!run.platformsScanned.includes(p)) run.platformsScanned.push(p);
        log(`${connector.name}: ${campaigns.length} campaigns, ${stored} metric rows, ${creativesStored} creatives`);
        await repo.saveIntegrationStatus({
          key: connector.key,
          name: connector.name,
          health: "connected",
          detail: `Synced ${campaigns.length} campaigns`,
          lastSyncAt: now.toISOString(),
        });
      } catch (err) {
        const message = errMsg(err);
        run.errors.push(`${connector.name}: ${message}`);
        await repo.saveIntegrationStatus({ key: connector.key, name: connector.name, health: "connection_issue", detail: message }).catch(() => undefined);
        log(`error ${connector.name}: ${message}`);
      }
    }
    // CRM funnel attribution: HubSpot lifecycle + deal events → campaign-day MQL/SQL/opportunity/pipeline/revenue.
    for (const crm of crmConnectors()) {
      if (!crm.isConfigured()) {
        log(`skip ${crm.name}: not configured`);
        continue;
      }
      try {
        const events = await crm.fetchFunnelEvents({ start: range.start, end: range.end });
        let campaigns = await repo.getCampaigns();
        // Paid-social campaigns the CRM attributes to but no ad connector supplies
        // (e.g. LinkedIn Ads synced into HubSpot) become spend-less placeholders.
        const derived = derivedSocialCampaigns(events, campaigns, new Set(run.platformsScanned));
        if (derived.length) {
          await repo.upsertCampaigns(derived, crm.key);
          campaigns = await repo.getCampaigns();
          log(`${crm.name}: ${derived.length} campaign(s) known only from CRM attribution added without spend data`);
        }
        const report = attributeFunnelEvents(events, campaigns, spendIndex(allMetrics, externalToId));
        const written = await repo.applyFunnelAttribution(report.rows, crm.key);
        // The whole funnel by original source (organic, direct, referral, paid…) for the CRM section.
        try {
          const daily = crmFunnelDaily(events);
          const n = await repo.upsertCrmFunnelDaily(daily, crm.key);
          log(`${crm.name}: ${n} source-day funnel rows`);
        } catch (err) {
          run.errors.push(`${crm.name} funnel by source: ${errMsg(err)}`);
        }
        log(
          `${crm.name}: ${events.length} events → ${written} campaign-days (name ${report.matchedByName}, channel ${report.matchedByChannel}, unattributed ${report.unattributed})`,
        );
        await repo.saveIntegrationStatus({
          key: crm.key,
          name: crm.name,
          health: "connected",
          detail: `${events.length} funnel events; ${report.unattributed} unattributed`,
          lastSyncAt: now.toISOString(),
        });
      } catch (err) {
        const message = errMsg(err);
        run.errors.push(`${crm.name}: ${message}`);
        await repo.saveIntegrationStatus({ key: crm.key, name: crm.name, health: "connection_issue", detail: message }).catch(() => undefined);
      }
    }

    // Web analytics (GA4) and organic search (Search Console): daily detail
    // for the Analytics and SEO sections. Each is independent.
    for (const analytics of analyticsConnectors()) {
      if (!analytics.isConfigured()) {
        log(`skip ${analytics.name}: not configured`);
        continue;
      }
      try {
        const rows = await analytics.fetchDaily({ start: range.start, end: range.end });
        const n = await repo.upsertGa4Daily(rows, analytics.key);
        log(`${analytics.name}: ${n} daily rows`);
        await repo.saveIntegrationStatus({
          key: analytics.key,
          name: analytics.name,
          health: "connected",
          detail: `Synced ${n} daily rows (channels, landing pages, key events)`,
          lastSyncAt: now.toISOString(),
        });
      } catch (err) {
        const message = errMsg(err);
        run.errors.push(`${analytics.name}: ${message}`);
        await repo.saveIntegrationStatus({ key: analytics.key, name: analytics.name, health: "connection_issue", detail: message }).catch(() => undefined);
      }
    }
    for (const search of searchConnectors()) {
      if (!search.isConfigured()) {
        log(`skip ${search.name}: not configured`);
        continue;
      }
      try {
        const rows = await search.fetchDaily({ start: range.start, end: range.end });
        const n = await repo.upsertSearchConsoleDaily(rows, search.key);
        log(`${search.name}: ${n} daily rows`);
        await repo.saveIntegrationStatus({
          key: search.key,
          name: search.name,
          health: "connected",
          detail: `Synced ${n} daily rows (site, queries, pages)`,
          lastSyncAt: now.toISOString(),
        });
      } catch (err) {
        const message = errMsg(err);
        run.errors.push(`${search.name}: ${message}`);
        await repo.saveIntegrationStatus({ key: search.key, name: search.name, health: "connection_issue", detail: message }).catch(() => undefined);
      }
    }

    // Independent health for non-ad integrations (CRM, analytics).
    try {
      const statuses = await checkAllIntegrations();
      const synced = new Set<string>(["ga4", "search_console"]);
      for (const s of statuses) {
        if (run.platformsScanned.length && ["notfair", "meta", "linkedin"].includes(s.key)) continue;
        if (synced.has(s.key) && s.health === "connected") continue; // keep the richer "Synced N rows" status from above
        await repo.saveIntegrationStatus(s).catch(() => undefined);
      }
    } catch (err) {
      run.errors.push(`integration health: ${errMsg(err)}`);
    }
  } else {
    run.platformsScanned = ["google", "meta", "linkedin"] as Platform[];
  }

  // 4–10. Analyze.
  try {
    const snapshot = await loadSnapshot(repo, options.windowDays ?? 30, now);
    run.campaignsScanned = snapshot.campaigns.filter((c) => c.campaign.status === "active").length;
    run.issuesDetected = snapshot.alerts.critical + snapshot.alerts.warnings + snapshot.alerts.anomalies;
    const recs = snapshot.recommendations.map((r) => ({ ...r, scanRunId: run.id }));
    await repo.saveRecommendations(recs);
    run.recommendationsCreated = recs.length;
    run.status = run.errors.length ? "partial" : "completed";
  } catch (err) {
    run.errors.push(`analysis: ${errMsg(err)}`);
    run.status = "failed";
  }

  // 11. Record.
  run.finishedAt = new Date().toISOString();
  await repo.saveScanRun(run);
  await repo.audit("hourly-scan", "scan.completed", "scan_run", run.id, { status: run.status, errors: run.errors });
  return run;
}

function errMsg(err: unknown) {
  if (!(err instanceof Error)) return String(err);
  const details = (err as { details?: unknown }).details;
  if (details === undefined || details === null) return err.message;
  const text = typeof details === "string" ? details : JSON.stringify(details);
  return `${err.message}: ${text.slice(0, 500)}`;
}

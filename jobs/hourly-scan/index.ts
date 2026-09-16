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
import { adPlatformConnectors, checkAllIntegrations, crmConnectors } from "@/integrations/registry";
import { attributeFunnelEvents, spendIndex } from "@/integrations/attribution";
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
        for (const p of connector.platforms) if (!run.platformsScanned.includes(p)) run.platformsScanned.push(p);
        log(`${connector.name}: ${campaigns.length} campaigns, ${stored} metric rows, ${creativesStored} creatives`);
        await repo.saveIntegrationStatus({ key: connector.key, name: connector.name, health: "connected", detail: `Synced ${campaigns.length} campaigns`, lastSyncAt: now.toISOString() });
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
        const campaigns = await repo.getCampaigns();
        const report = attributeFunnelEvents(events, campaigns, spendIndex(allMetrics, externalToId));
        const written = await repo.applyFunnelAttribution(report.rows, crm.key);
        log(`${crm.name}: ${events.length} events → ${written} campaign-days (name ${report.matchedByName}, channel ${report.matchedByChannel}, unattributed ${report.unattributed})`);
        await repo.saveIntegrationStatus({ key: crm.key, name: crm.name, health: "connected", detail: `${events.length} funnel events; ${report.unattributed} unattributed`, lastSyncAt: now.toISOString() });
      } catch (err) {
        const message = errMsg(err);
        run.errors.push(`${crm.name}: ${message}`);
        await repo.saveIntegrationStatus({ key: crm.key, name: crm.name, health: "connection_issue", detail: message }).catch(() => undefined);
      }
    }

    // Independent health for non-ad integrations (CRM, analytics).
    try {
      const statuses = await checkAllIntegrations();
      for (const s of statuses) if (!run.platformsScanned.length || !["notfair", "meta", "linkedin"].includes(s.key)) await repo.saveIntegrationStatus(s).catch(() => undefined);
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
  return err instanceof Error ? err.message : String(err);
}

import type { DataRepository } from "@/lib/data/repository";
import { buildSnapshot, type AnalysisSnapshot } from "./snapshot";
import { windowEnding } from "@/lib/utils/dates";

/**
 * Load everything the analysis needs from a repository and build the
 * snapshot. History is loaded generously (window + baseline + previous
 * window) so fatigue baselines and "why did it change" comparisons work.
 */
export async function loadSnapshot(repo: DataRepository, windowDays: number, now = new Date()): Promise<AnalysisSnapshot> {
  const [organization, settings, endDate, campaigns, creatives] = await Promise.all([
    repo.getOrganization(),
    repo.getSettings(),
    repo.getLatestDate(),
    repo.getCampaigns(),
    repo.getCreatives(),
  ]);
  const historyDays = Math.max(windowDays * 2, 45);
  const range = windowEnding(endDate, historyDays);
  const [dailyMetrics, creativeDailyMetrics, audienceSegments] = await Promise.all([
    repo.getDailyMetrics({ start: range.start, end: range.end }),
    repo.getCreativeDailyMetrics({ start: range.start, end: range.end }),
    repo.getAudienceSegments({ start: range.start, end: range.end }),
  ]);
  return buildSnapshot({
    organization,
    campaigns,
    dailyMetrics,
    creatives,
    creativeDailyMetrics,
    audienceSegments,
    endDate,
    windowDays,
    fatigueThresholds: settings.fatigueThresholds,
    policy: settings.automationPolicy,
    now,
  });
}

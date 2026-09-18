import { cache } from "react";
import type { DataRepository } from "@/lib/data/repository";
import { getRepository } from "@/lib/data";
import { previousWindow, windowEnding } from "@/lib/utils/dates";
import { buildWeeklyReport, type WeeklyReport } from "./weekly";
import { nextFocus, weeklySummary, type FocusItem } from "./weekly-narrative";

export interface WeeklyReportPage extends WeeklyReport {
  summary: string[];
  nextFocus: FocusItem[];
  /** Latest complete day of data. */
  endDate: string;
}

/** Load campaign-day and ad-day rows for the period plus the previous one and build the report. */
export async function loadWeeklyReport(repo: DataRepository, days: number, endDate?: string): Promise<WeeklyReportPage> {
  const end = endDate ?? (await repo.getLatestDate());
  const window = windowEnding(end, days, days === 7 ? "this week" : `last ${days} days`);
  const previous = previousWindow(window);
  if (days === 7) previous.label = "last week";
  const range = { start: previous.start, end: window.end };
  // Ad-level rows are optional: if they cannot be read the report still renders
  // (the ad section says so) rather than failing the whole page.
  const optional = <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);
  const [campaigns, dailyMetrics, creatives, creativeDailyMetrics, integrations, runs] = await Promise.all([
    repo.getCampaigns(),
    repo.getDailyMetrics(range),
    optional(repo.getCreatives()),
    optional(repo.getCreativeDailyMetrics(range)),
    repo.getIntegrationStatuses(),
    optional(repo.getScanRuns(1)),
  ]);
  const last = runs[0];
  const report = buildWeeklyReport({
    campaigns,
    dailyMetrics,
    creatives,
    creativeDailyMetrics,
    window,
    previous,
    integrations,
    lastSyncAt: last?.finishedAt ?? last?.startedAt,
  });
  return { ...report, summary: weeklySummary(report), nextFocus: nextFocus(report), endDate: end };
}

/** ?window= → days for the report: 7 (default), 14, 30 or a custom integer 2–90. */
export function reportDaysFrom(param: string | string[] | undefined): { days: number; key: string } {
  const raw = Array.isArray(param) ? param[0] : param;
  if (raw === "14d") return { days: 14, key: "14d" };
  if (raw === "30d") return { days: 30, key: "30d" };
  if (raw && /^\d+$/.test(raw)) {
    const n = Math.min(90, Math.max(2, Number(raw)));
    return n === 7 ? { days: 7, key: "7d" } : n === 14 ? { days: 14, key: "14d" } : n === 30 ? { days: 30, key: "30d" } : { days: n, key: String(n) };
  }
  return { days: 7, key: "7d" };
}

export const getWeeklyReportPage = cache(async (days: number) => {
  const repo = await getRepository();
  return loadWeeklyReport(repo, days);
});

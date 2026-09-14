/**
 * Creative / campaign fatigue detection.
 *
 * Compares a short recent window (~48h) against a longer baseline and
 * combines CTR, CPC, conversion, frequency, impression trend and pipeline
 * signals into a 0–100 fatigue score.
 */

import type { DailyMetric, FatigueAssessment, FatigueSignal, FatigueStatus, FatigueThresholds } from "@/types/domain";
import { sumTotals, deriveMetrics } from "@/lib/calculations/metrics";

export const DEFAULT_FATIGUE_THRESHOLDS: FatigueThresholds = {
  criticalCtr: 0.015,
  warningCtrBand: 0.004,
  deteriorationPct: 0.15,
  lookbackDays: 2,
  baselineDays: 14,
  maxFrequency: 4,
  minRecentImpressions: 400,
  minRecentClicks: 12,
};

function change(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null || baseline === 0) return null;
  return (current - baseline) / baseline;
}

function signal(
  key: string,
  label: string,
  current: number | null,
  baseline: number | null,
  higherIsBetter: boolean,
): FatigueSignal | null {
  if (current === null || baseline === null) return null;
  const ch = change(current, baseline);
  if (ch === null) return null;
  const worse = higherIsBetter ? ch < -0.05 : ch > 0.05;
  const better = higherIsBetter ? ch > 0.05 : ch < -0.05;
  return { key, label, current, baseline, change: ch, direction: worse ? "worse" : better ? "better" : "flat" };
}

export function assessFatigue(
  series: DailyMetric[],
  thresholds: FatigueThresholds = DEFAULT_FATIGUE_THRESHOLDS,
  options: { isPaidSocial?: boolean } = {},
): FatigueAssessment {
  const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : 1));
  const recent = sorted.slice(-thresholds.lookbackDays);
  const baselineRows = sorted.slice(-(thresholds.lookbackDays + thresholds.baselineDays), -thresholds.lookbackDays);

  if (recent.length === 0 || baselineRows.length < 3) {
    return { score: 0, status: "healthy", signals: [], reasons: ["Insufficient history for fatigue analysis."] };
  }

  const r = sumTotals(recent);
  const b = sumTotals(baselineRows);
  const rm = deriveMetrics(r);
  const bm = deriveMetrics(b);

  // Minimum-data guard: with too few impressions/clicks in the recent window
  // CTR and CPC swings are noise, not fatigue.
  const lowData = r.impressions < thresholds.minRecentImpressions || r.clicks < thresholds.minRecentClicks;

  const recentDailyImpr = r.impressions / recent.length;
  const baseDailyImpr = b.impressions / baselineRows.length;

  const signals = [
    signal("ctr", "CTR", rm.ctr, bm.ctr, true),
    signal("cpc", "CPC", rm.cpc, bm.cpc, false),
    signal("lead_rate", "Conversion rate", rm.leadRate, bm.leadRate, true),
    signal("impressions", "Daily impressions", recentDailyImpr, baseDailyImpr, true),
    signal("mql_rate", "MQL rate", rm.mqlRate, bm.mqlRate, true),
    signal("sql_rate", "SQL rate", rm.sqlRate, bm.sqlRate, true),
    signal("pipeline_per_day", "Pipeline / day", r.pipeline / recent.length, b.pipeline / baselineRows.length, true),
  ].filter((s): s is FatigueSignal => s !== null);

  if (options.isPaidSocial && typeof r.frequency === "number") {
    signals.push({
      key: "frequency",
      label: "Frequency",
      current: r.frequency,
      baseline: b.frequency ?? r.frequency,
      change: change(r.frequency, b.frequency ?? null) ?? 0,
      direction: r.frequency > thresholds.maxFrequency ? "worse" : "flat",
    });
  }

  // Score construction
  let score = 0;
  const reasons: string[] = [];
  const ctrNow = rm.ctr;
  const ctrDrop = signals.find((s) => s.key === "ctr")?.change ?? 0;

  // The absolute CTR floor only applies to campaigns that used to clear it;
  // a campaign that has always run below the floor (e.g. LinkedIn ABM at 0.9%)
  // is judged on trend alone.
  const floorApplies = bm.ctr !== null && bm.ctr >= thresholds.criticalCtr;
  if (floorApplies && ctrNow !== null && ctrNow < thresholds.criticalCtr) {
    score += 30;
    reasons.push(`CTR ${(ctrNow * 100).toFixed(2)}% is below the ${(thresholds.criticalCtr * 100).toFixed(1)}% floor`);
  } else if (floorApplies && ctrNow !== null && ctrNow < thresholds.criticalCtr + thresholds.warningCtrBand) {
    score += 15;
    reasons.push(`CTR ${(ctrNow * 100).toFixed(2)}% is approaching the ${(thresholds.criticalCtr * 100).toFixed(1)}% floor`);
  }

  if (ctrDrop <= -thresholds.deteriorationPct) {
    score += 25;
    reasons.push(`CTR fell ${Math.abs(ctrDrop * 100).toFixed(0)}% vs. the ${thresholds.baselineDays}-day baseline`);
  } else if (ctrDrop <= -thresholds.deteriorationPct / 2) {
    score += 12;
    reasons.push(`CTR trending down ${Math.abs(ctrDrop * 100).toFixed(0)}%`);
  }

  const cpcRise = signals.find((s) => s.key === "cpc")?.change ?? 0;
  if (cpcRise >= thresholds.deteriorationPct) {
    score += 15;
    reasons.push(`CPC up ${(cpcRise * 100).toFixed(0)}%`);
  }

  const convDrop = signals.find((s) => s.key === "lead_rate")?.change ?? 0;
  if (convDrop <= -thresholds.deteriorationPct) {
    score += 12;
    reasons.push(`Conversion rate down ${Math.abs(convDrop * 100).toFixed(0)}%`);
  }

  const imprDrop = signals.find((s) => s.key === "impressions")?.change ?? 0;
  if (imprDrop <= -0.3) {
    score += 8;
    reasons.push(`Impressions down ${Math.abs(imprDrop * 100).toFixed(0)}% (auction share loss)`);
  }

  const freq = signals.find((s) => s.key === "frequency");
  if (freq && freq.current > thresholds.maxFrequency) {
    score += 15;
    reasons.push(`Frequency ${freq.current.toFixed(1)} exceeds ${thresholds.maxFrequency}`);
  }

  const pipeDrop = signals.find((s) => s.key === "pipeline_per_day")?.change ?? 0;
  const sqlDrop = signals.find((s) => s.key === "sql_rate")?.change ?? 0;
  if (pipeDrop <= -0.25 && sqlDrop <= -0.1) {
    score += 10;
    reasons.push(`Pipeline per day down ${Math.abs(pipeDrop * 100).toFixed(0)}% with weaker SQL conversion`);
  }

  score = Math.min(100, Math.round(score));

  // Status rules (configurable thresholds):
  // Critical: CTR below floor AND meaningful deterioration.
  // Warning: CTR approaching floor OR material downward trend.
  // Fatigue is a CHANGE, not a level: a campaign that always ran at 0.9% CTR
  // (e.g. LinkedIn ABM) is not "fatigued" unless it has also deteriorated.
  let status: FatigueStatus = "healthy";
  const belowFloor = floorApplies && ctrNow !== null && ctrNow < thresholds.criticalCtr && ctrDrop <= -0.1;
  const nearFloor = floorApplies && ctrNow !== null && ctrNow < thresholds.criticalCtr + thresholds.warningCtrBand && ctrDrop <= -0.05;
  const deteriorating = ctrDrop <= -thresholds.deteriorationPct || (cpcRise >= thresholds.deteriorationPct && convDrop <= -thresholds.deteriorationPct / 2);
  const frequencyHigh = Boolean(freq && freq.current > thresholds.maxFrequency);
  if ((belowFloor && deteriorating) || score >= 60 || (frequencyHigh && deteriorating)) status = "critical";
  else if (nearFloor || deteriorating || frequencyHigh || score >= 35) status = "warning";

  if (lowData) {
    // Not enough recent volume to confirm: cap at warning and say so.
    if (status === "critical") status = "warning";
    if (status === "warning" && score < 40) status = "healthy";
    if (status !== "healthy") reasons.push(`Low recent volume (${r.impressions} impressions, ${r.clicks} clicks) — confirm over a longer window.`);
    else reasons.length = 0;
  }

  if (reasons.length === 0) reasons.push("Performance is stable or improving vs. baseline.");
  return { score: lowData ? Math.min(score, 45) : score, status, signals, reasons };
}

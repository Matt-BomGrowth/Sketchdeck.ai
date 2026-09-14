/**
 * Simple, explainable anomaly detection on daily campaign metrics using a
 * robust z-score (median / MAD) over a trailing baseline.
 */

import type { DailyMetric } from "@/types/domain";

export interface Anomaly {
  campaignId: string;
  date: string;
  metric: keyof Pick<DailyMetric, "spend" | "clicks" | "leads" | "mqls" | "sqls" | "pipeline" | "impressions">;
  value: number;
  expected: number;
  zScore: number;
  direction: "spike" | "drop";
  severity: "high" | "medium";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function detectAnomalies(
  series: DailyMetric[],
  options: { baselineDays?: number; threshold?: number; metrics?: Anomaly["metric"][] } = {},
): Anomaly[] {
  const baselineDays = options.baselineDays ?? 14;
  const threshold = options.threshold ?? 3;
  const metrics = options.metrics ?? ["spend", "leads", "sqls", "pipeline", "impressions"];
  const sorted = [...series].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sorted.length < baselineDays + 1) return [];

  const last = sorted[sorted.length - 1];
  const baseline = sorted.slice(-(baselineDays + 1), -1);
  const out: Anomaly[] = [];

  for (const metric of metrics) {
    const values = baseline.map((r) => r[metric] ?? 0);
    const med = median(values);
    const mad = median(values.map((v) => Math.abs(v - med))) || Math.max(med * 0.15, 1);
    const value = last[metric] ?? 0;
    const z = (value - med) / (1.4826 * mad);
    if (Math.abs(z) >= threshold && Math.abs(value - med) > Math.max(1, med * 0.2)) {
      out.push({
        campaignId: last.campaignId,
        date: last.date,
        metric,
        value,
        expected: med,
        zScore: z,
        direction: z > 0 ? "spike" : "drop",
        severity: Math.abs(z) >= threshold * 2 ? "high" : "medium",
      });
    }
  }
  return out;
}

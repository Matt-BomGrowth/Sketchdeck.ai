import { generateDemoDataset, type DemoDataset } from "./generate";
import { toISODate } from "@/lib/utils/dates";

const cache = new Map<string, DemoDataset>();

/** Demo data ends "yesterday" (UTC) so the latest full day is complete. */
export function demoEndDate(now = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return toISODate(d);
}

export function getDemoDataset(endDate = process.env.DEMO_ANCHOR_DATE || demoEndDate()): DemoDataset {
  const cached = cache.get(endDate);
  if (cached) return cached;
  const ds = generateDemoDataset(endDate);
  cache.set(endDate, ds);
  return ds;
}

export type { DemoDataset };
export { generateDemoDataset };

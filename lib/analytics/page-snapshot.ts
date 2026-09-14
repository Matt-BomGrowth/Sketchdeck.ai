import { cache } from "react";
import { getRepository } from "@/lib/data";
import { loadSnapshot } from "./load-snapshot";
import { presetToDays } from "@/lib/utils/dates";

/** Resolve the ?window= param to days (presets or a custom integer). */
export function windowDaysFrom(param: string | string[] | undefined): { days: number; key: string } {
  const raw = Array.isArray(param) ? param[0] : param;
  if (raw && /^\d+$/.test(raw)) {
    const n = Math.min(180, Math.max(2, Number(raw)));
    return { days: n, key: String(n) };
  }
  const key = raw === "7d" || raw === "90d" ? raw : "30d";
  return { days: presetToDays(key), key };
}

/** Per-request memoized snapshot so layout + page share one analysis. */
export const getPageSnapshot = cache(async (days: number) => {
  const repo = await getRepository();
  return loadSnapshot(repo, days);
});

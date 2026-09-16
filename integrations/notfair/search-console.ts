/**
 * Google Search Console via NotFair's `search_console_runScript`.
 * Verified live on 2026-09-16 (site https://www.sketchdeck.ai/): 35 days of
 * date totals, date×query and date×page returned in 322ms. `dataState: 'all'`
 * includes the last 2–3 days that Google has not finalised yet.
 */

import type { NormalizedSearchConsoleDaily } from "@/integrations/types";

export function searchConsoleDailyScript(start: string, end: string, opts: { queryRows?: number; pageRows?: number } = {}) {
  return `
const base = { startDate: '${start}', endDate: '${end}', dataState: 'all', type: 'web' };
const r = await search.queryParallel([
  { name: 'site', body: { ...base, dimensions: ['date'], rowLimit: 500 } },
  { name: 'queries', body: { ...base, dimensions: ['date','query'], rowLimit: ${opts.queryRows ?? 4000} } },
  { name: 'pages', body: { ...base, dimensions: ['date','page'], rowLimit: ${opts.pageRows ?? 3000} } }
]);
const pack = (x) => (x && x.ok ? (x.data.rows || []).map((row) => [row.keys[0], row.keys[1] || '', row.clicks || 0, row.impressions || 0, row.position == null ? null : row.position]) : []);
const err = (x) => (x && !x.ok ? x.error : null);
return { siteUrl: search.activeSiteUrl, site: pack(r.site), queries: pack(r.queries), pages: pack(r.pages), errors: { site: err(r.site), queries: err(r.queries), pages: err(r.pages) } };
`;
}

export interface SearchConsoleDailyResult {
  siteUrl: string;
  /** [date, '', clicks, impressions, position] */
  site: unknown[][];
  /** [date, query, clicks, impressions, position] */
  queries: unknown[][];
  /** [date, page, clicks, impressions, position] */
  pages: unknown[][];
  errors: Record<string, unknown>;
}

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export function normalizeSearchConsoleDaily(data: SearchConsoleDailyResult): NormalizedSearchConsoleDaily[] {
  const out: NormalizedSearchConsoleDaily[] = [];
  const push = (dimension: NormalizedSearchConsoleDaily["dimension"], rows: unknown[][]) => {
    for (const t of rows ?? []) {
      if (!t[0]) continue;
      const impressions = n(t[3]);
      out.push({
        date: String(t[0]),
        dimension,
        value: dimension === "site" ? "" : String(t[1] ?? ""),
        clicks: n(t[2]),
        impressions,
        position: impressions > 0 && t[4] !== null && t[4] !== undefined ? n(t[4]) : undefined,
      });
    }
  };
  push("site", data.site);
  push("query", data.queries);
  push("page", data.pages);
  return out;
}

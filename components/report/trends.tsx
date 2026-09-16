"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportMetricKey, TrendPoint } from "./types";
import { fmtDate } from "@/lib/utils/format";
import { fmtReportMetric } from "./wow";
import { cn } from "@/lib/utils/cn";

const METRICS: Array<{ key: ReportMetricKey; label: string; format: "currency" | "currency2" | "number" | "pct" | "multiple" | "cpm" }> = [
  { key: "spend", label: "Spend", format: "currency" },
  { key: "conversions", label: "Conversions", format: "number" },
  { key: "costPerConversion", label: "Cost / conversion", format: "currency2" },
  { key: "ctr", label: "CTR", format: "pct" },
  { key: "impressions", label: "Impressions", format: "number" },
  { key: "clicks", label: "Clicks", format: "number" },
  { key: "cpc", label: "CPC", format: "currency2" },
  { key: "cpm", label: "CPM", format: "cpm" },
  { key: "reach", label: "Reach", format: "number" },
  { key: "frequency", label: "Frequency", format: "multiple" },
];

function read(p: TrendPoint["current"], key: ReportMetricKey): number | null {
  return (p as unknown as Record<string, number | null>)[key] ?? null;
}

/** Period total for count/money metrics; ratio recomputed from the period totals for rates. */
function sum(rows: Array<{ current: number | null; previous: number | null }>, side: "current" | "previous", key: ReportMetricKey): number | null {
  if (["ctr", "cpc", "cpm", "costPerConversion", "frequency"].includes(key)) return null;
  return rows.reduce((s, r) => s + (r[side] ?? 0), 0);
}

/** Section 5a: four mini charts — this period (solid) vs. the previous period (dashed), day by day. */
export function TrendMinis({ trend, windowLabel, previousLabel }: { trend: TrendPoint[]; windowLabel: string; previousLabel: string }) {
  const keys: ReportMetricKey[] = ["spend", "conversions", "costPerConversion", "ctr"];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {keys.map((key) => {
        const def = METRICS.find((m) => m.key === key)!;
        const rows = trend.map((p) => ({ date: p.date, previousDate: p.previousDate, current: read(p.current, key), previous: read(p.previous, key) }));
        return (
          <div key={key} className="rounded-lg border border-border px-3 pt-2 pb-1">
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
              <span className="truncate font-medium uppercase tracking-wide">{def.label}</span>
              {sum(rows, "current", key) !== null ? (
                <span className="tnum shrink-0 text-foreground">{fmtReportMetric(sum(rows, "current", key), def.format)}</span>
              ) : null}
            </div>
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                    labelFormatter={(d) => fmtDate(String(d))}
                    formatter={(value, name, item) => [
                      fmtReportMetric(value === null ? null : Number(value), def.format),
                      name === "previous" ? `${previousLabel} (${fmtDate((item.payload as { previousDate: string }).previousDate || "")})` : windowLabel,
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="current"
                    name="current"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="previous"
                    name="previous"
                    stroke="var(--chart-4)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Section 5b: full trend chart with a metric switcher over the selected period. */
export function TrendChart({
  trend,
  windowLabel,
  previousLabel,
  available,
}: {
  trend: TrendPoint[];
  windowLabel: string;
  previousLabel: string;
  available: ReportMetricKey[];
}) {
  const metrics = METRICS.filter((m) => available.includes(m.key));
  const [key, setKey] = useState<ReportMetricKey>(metrics[0]?.key ?? "spend");
  const def = METRICS.find((m) => m.key === key) ?? METRICS[0];
  const rows = trend.map((p) => ({ date: p.date, previousDate: p.previousDate, current: read(p.current, key), previous: read(p.previous, key) }));
  return (
    <div className="flex flex-col gap-3">
      <div
        className="inline-flex h-auto max-w-full flex-wrap items-center gap-1 self-start rounded-md bg-surface-2 p-1"
        role="tablist"
        aria-label="Trend metric"
      >
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={m.key === key}
            onClick={() => setKey(m.key)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
              m.key === key ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tickFormatter={(v: number) => fmtReportMetric(v, def.format)} tickLine={false} axisLine={false} width={60} />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(d) => fmtDate(String(d), { month: "short", day: "numeric", year: "numeric" })}
              formatter={(value, name, item) => [
                fmtReportMetric(value === null ? null : Number(value), def.format),
                name === "previous"
                  ? `${def.label} · ${previousLabel} (${fmtDate((item.payload as { previousDate: string }).previousDate || "")})`
                  : `${def.label} · ${windowLabel}`,
              ]}
            />
            <Line type="monotone" dataKey="current" name="current" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            <Line
              type="monotone"
              dataKey="previous"
              name="previous"
              stroke="var(--chart-4)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

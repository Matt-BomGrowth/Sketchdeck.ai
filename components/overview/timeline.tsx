"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TIMELINE_METRICS, type TimelineMetric, type TimelinePoint } from "@/lib/analytics/channel-detail";
import { fmtCompactCurrency, fmtCompactNumber, fmtDate } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

/**
 * Performance timeline with a metric switcher. Solid line = selected window,
 * dashed = the same day-offset in the previous period. Metrics with no data
 * in either period (e.g. organic clicks before Search Console is connected)
 * are hidden from the switcher.
 */
export function TimelineChart({ data, windowLabel, previousLabel }: { data: TimelinePoint[]; windowLabel: string; previousLabel: string }) {
  const available = TIMELINE_METRICS.filter((m) => data.some((d) => d[m.key] > 0 || d.previous[m.key] > 0));
  const [metric, setMetric] = useState<TimelineMetric>(available[0]?.key ?? "spend");
  const def = TIMELINE_METRICS.find((m) => m.key === metric) ?? TIMELINE_METRICS[0];
  const fmt = (v: number) => (def.format === "currency" ? fmtCompactCurrency(v) : fmtCompactNumber(v));
  const rows = data.map((d) => ({ date: d.date, previousDate: d.previousDate, current: d[metric], previous: d.previous[metric] }));
  const totalCur = rows.reduce((s, r) => s + r.current, 0);
  const totalPrev = rows.reduce((s, r) => s + r.previous, 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex h-auto max-w-full flex-wrap items-center gap-1 rounded-md bg-surface-2 p-1" role="tablist" aria-label="Timeline metric">
          {(available.length ? available : TIMELINE_METRICS.slice(0, 1)).map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={m.key === metric} onClick={() => setMetric(m.key)} className={cn("rounded-sm px-2.5 py-1 text-xs font-medium transition-colors", m.key === metric ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground")}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="tnum text-xs text-muted">
          <span className="font-medium text-foreground">{fmt(totalCur)}</span> {windowLabel} · <span className="font-medium text-foreground">{fmt(totalPrev)}</span> {previousLabel}
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)" }}
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(d) => fmtDate(String(d), { month: "short", day: "numeric", year: "numeric" })}
              formatter={(value, name, item) => {
                const p = item.payload as { previousDate: string };
                return [fmt(Number(value)), name === "previous" ? `${def.label} · ${p.previousDate ? fmtDate(p.previousDate) : "prior period"}` : def.label];
              }}
            />
            <Line type="monotone" dataKey="current" name="current" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="previous" name="previous" stroke="var(--chart-4)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

import { pctChange } from "@/lib/calculations/metrics";
import { DASH, fmtCompactCurrency, fmtCompactNumber, fmtCurrency, fmtMultiple, fmtNumber, fmtPct } from "@/lib/utils/format";
import { Delta } from "@/components/dashboard/status";
import { cn } from "@/lib/utils/cn";

export type MetricFormat = "currency" | "currency2" | "compactCurrency" | "number" | "compact" | "pct" | "pct2" | "multiple" | "position" | "score";

export function fmtMetric(value: number | null | undefined, format: MetricFormat): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  switch (format) {
    case "currency":
      return fmtCurrency(value);
    case "currency2":
      return fmtCurrency(value, { cents: true });
    case "compactCurrency":
      return fmtCompactCurrency(value);
    case "number":
      return fmtNumber(value);
    case "compact":
      return fmtCompactNumber(value);
    case "pct":
      return fmtPct(value, 1);
    case "pct2":
      return fmtPct(value, 2);
    case "multiple":
      return fmtMultiple(value);
    case "position":
      return value.toFixed(1);
    case "score":
      return `${value.toFixed(0)}/10`;
  }
}

/**
 * A metric with its prior-period value and relative change. `invert` marks
 * metrics where a decrease is good (spend, CPA, CPC, position).
 */
export function Compare({ value, previous, format, invert = false, align = "right", className, hidePrevious = false }: { value: number | null | undefined; previous: number | null | undefined; format: MetricFormat; invert?: boolean; align?: "left" | "right"; className?: string; hidePrevious?: boolean }) {
  const delta = value === null || value === undefined || previous === null || previous === undefined ? null : pctChange(value, previous);
  return (
    <div className={cn("tnum flex flex-col leading-tight", align === "right" ? "items-end text-right" : "items-start", className)}>
      <span className="text-sm font-medium">{fmtMetric(value, format)}</span>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-2">
        {delta !== null ? <Delta value={delta} invert={invert} /> : <span>—</span>}
        {!hidePrevious ? <span>prev {fmtMetric(previous, format)}</span> : null}
      </span>
    </div>
  );
}

/** Large KPI with prior period underneath (used in section KPI strips). */
export function Kpi({ label, value, previous, format, invert = false, hint }: { label: string; value: number | null | undefined; previous?: number | null | undefined; format: MetricFormat; invert?: boolean; hint?: string }) {
  const delta = value === null || value === undefined || previous === null || previous === undefined ? null : pctChange(value, previous);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border bg-surface-2/40 px-3 py-2.5">
      <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="tnum text-lg font-semibold tracking-tight">{fmtMetric(value, format)}</span>
      <span className="tnum flex flex-wrap items-center gap-1.5 text-[11px] text-muted-2">
        {previous !== undefined ? (
          <>
            {delta !== null ? <Delta value={delta} invert={invert} /> : <span>—</span>}
            <span>prev {fmtMetric(previous, format)}</span>
          </>
        ) : hint ? (
          <span>{hint}</span>
        ) : null}
      </span>
    </div>
  );
}

export function NotConnected({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border px-4 py-5">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xl text-xs text-muted">{description}</p>
      {action}
    </div>
  );
}

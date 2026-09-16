import type { MetricComparison, MetricDirection, ReportMetricDef } from "@/lib/reports/weekly";
import { REPORT_METRICS } from "@/lib/reports/weekly";
import { pctChange } from "@/lib/calculations/metrics";
import { DASH, fmtCurrency, fmtMultiple, fmtNumber, fmtPct } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function fmtReportMetric(value: number | null | undefined, format: ReportMetricDef["format"]): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  switch (format) {
    case "currency":
      return fmtCurrency(value);
    case "currency2":
      return fmtCurrency(value, { cents: true });
    case "cpm":
      return fmtCurrency(value, { cents: true });
    case "number":
      return fmtNumber(value);
    case "pct":
      return fmtPct(value, 2);
    case "multiple":
      return fmtMultiple(value);
  }
}

export function metricDef(key: ReportMetricDef["key"]): ReportMetricDef {
  return REPORT_METRICS.find((m) => m.key === key)!;
}

export type Verdict = MetricComparison["verdict"];

export function verdictFor(change: number | null, direction: MetricDirection): Verdict {
  if (change === null) return "unknown";
  if (Math.abs(change) < 0.005) return "flat";
  if (direction === "neutral") return "neutral";
  return (change > 0) === (direction === "higher_better") ? "better" : "worse";
}

/**
 * Week-over-week change. Colour follows the metric's meaning, not the sign:
 * a falling cost per conversion is green, a rising one red; spend and volume
 * changes stay neutral because more or less spend is not inherently good.
 */
export function WowDelta({ change, direction, className, digits }: { change: number | null; direction: MetricDirection; className?: string; digits?: number }) {
  const verdict = verdictFor(change, direction);
  if (change === null) return <span className={cn("text-xs text-muted-2", className)}>— n/a</span>;
  const tone = verdict === "better" ? "text-positive" : verdict === "worse" ? "text-negative" : verdict === "flat" ? "text-muted" : "text-foreground";
  const arrow = verdict === "flat" ? "→" : change > 0 ? "↑" : "↓";
  const d = digits ?? (Math.abs(change) < 0.1 ? 1 : 0);
  return (
    <span className={cn("tnum inline-flex items-center gap-0.5 text-xs font-semibold", tone, className)} title={verdict === "neutral" ? "Neither good nor bad by itself" : undefined}>
      {arrow} {Math.abs(change * 100).toFixed(d)}%
    </span>
  );
}

export function VerdictWord({ verdict }: { verdict: Verdict }) {
  const map: Record<Verdict, { label: string; cls: string }> = {
    better: { label: "Improved", cls: "text-positive" },
    worse: { label: "Declined", cls: "text-negative" },
    flat: { label: "Flat", cls: "text-muted" },
    neutral: { label: "Changed", cls: "text-muted" },
    unknown: { label: "No comparison", cls: "text-muted-2" },
  };
  const m = map[verdict];
  return <span className={cn("text-[11px] font-medium", m.cls)}>{m.label}</span>;
}

/**
 * The report's core metric tile: This period | Previous | WoW, plus a two-bar
 * comparison so the direction is visible at a glance.
 */
export function MetricTile({ def, current, previous, size = "md", note }: { def: ReportMetricDef; current: number | null; previous: number | null; size?: "md" | "lg"; note?: string }) {
  const change = current === null || previous === null ? null : pctChange(current, previous);
  const verdict = verdictFor(change, def.direction);
  const max = Math.max(current ?? 0, previous ?? 0) || 1;
  const barTone = verdict === "better" ? "bg-positive" : verdict === "worse" ? "bg-negative" : "bg-accent";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-surface px-4 py-3 shadow-card", verdict === "worse" && "border-negative/30", verdict === "better" && "border-positive/30")}>
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted" title={def.hint}>
          {def.label}
        </span>
        <VerdictWord verdict={verdict} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn("tnum font-semibold tracking-tight", size === "lg" ? "text-2xl" : "text-xl")}>{fmtReportMetric(current, def.format)}</span>
        <WowDelta change={change} direction={def.direction} />
      </div>
      <div className="flex flex-col gap-1" aria-hidden>
        <Bar label="This period" value={current} max={max} format={def.format} tone={barTone} />
        <Bar label="Previous" value={previous} max={max} format={def.format} tone="bg-border-strong" />
      </div>
      {note ? <span className="text-[10px] text-muted-2">{note}</span> : null}
    </div>
  );
}

function Bar({ label, value, max, format, tone }: { label: string; value: number | null; max: number; format: ReportMetricDef["format"]; tone: string }) {
  const w = value === null ? 0 : Math.max(2, (value / max) * 100);
  return (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-[11px] text-muted">
      <span>{label}</span>
      <div className="h-1.5 rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${w}%` }} />
      </div>
      <span className="tnum text-foreground">{fmtReportMetric(value, format)}</span>
    </div>
  );
}

/** Table cell: value with WoW under it. */
export function WowCell({ value, previous, format, direction, align = "right" }: { value: number | null; previous: number | null; format: ReportMetricDef["format"]; direction: MetricDirection; align?: "left" | "right" }) {
  const change = value === null || previous === null ? null : pctChange(value, previous);
  return (
    <div className={cn("tnum flex flex-col leading-tight", align === "right" ? "items-end text-right" : "items-start")}>
      <span className="text-sm font-medium">{fmtReportMetric(value, format)}</span>
      <WowDelta change={change} direction={direction} className="text-[11px]" />
    </div>
  );
}

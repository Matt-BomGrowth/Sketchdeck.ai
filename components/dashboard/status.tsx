import type { FatigueStatus, HealthStatus, Platform, RecommendationStatus, ActionStatus, IntegrationHealth } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { PLATFORM_LABEL } from "@/lib/utils/format";

export function PlatformBadge({ platform, short = false }: { platform: Platform; short?: boolean }) {
  return <Badge variant={platform}>{short ? PLATFORM_LABEL[platform].replace(" Ads", "") : PLATFORM_LABEL[platform]}</Badge>;
}

export function HealthPill({ score, status, label }: { score: number; status: HealthStatus; label: string }) {
  const tone = status === "healthy" ? "positive" : status === "watch" ? "info" : status === "at_risk" ? "warning" : "negative";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tnum text-sm font-semibold">{score}</span>
      <Badge variant={tone}>{label}</Badge>
    </span>
  );
}

export function FatiguePill({ status, score }: { status: FatigueStatus; score?: number }) {
  const map = { healthy: { emoji: "🟢", label: "Healthy", v: "positive" }, warning: { emoji: "🟡", label: "Warning", v: "warning" }, critical: { emoji: "🔴", label: "Critical", v: "negative" } } as const;
  const m = map[status];
  return (
    <Badge variant={m.v}>
      <span aria-hidden>{m.emoji}</span> {m.label}
      {typeof score === "number" ? <span className="tnum opacity-70">· {score}</span> : null}
    </Badge>
  );
}

export function RecStatusBadge({ status }: { status: RecommendationStatus | ActionStatus }) {
  const v =
    status === "executed" || status === "measured" || status === "approved" || status === "modified"
      ? "positive"
      : status === "rejected" || status === "failed"
        ? "negative"
        : status === "executing"
          ? "info"
          : "warning";
  return <Badge variant={v} className="capitalize">{status.replace("_", " ")}</Badge>;
}

export function IntegrationHealthDot({ health, className }: { health: IntegrationHealth; className?: string }) {
  const map: Record<IntegrationHealth, { emoji: string; label: string }> = {
    connected: { emoji: "🟢", label: "Connected" },
    connection_issue: { emoji: "🟡", label: "Connection issue" },
    not_configured: { emoji: "⚪", label: "Not configured" },
    demo: { emoji: "🟡", label: "Demo data" },
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span aria-hidden>{map[health].emoji}</span>
      {map[health].label}
    </span>
  );
}

export function Delta({ value, invert = false, className, digits = 0 }: { value: number | null | undefined; invert?: boolean; className?: string; digits?: number }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={cn("text-xs text-muted-2", className)}>—</span>;
  const good = invert ? value < 0 : value > 0;
  const flat = Math.abs(value) < 0.005;
  const tone = flat ? "text-muted" : good ? "text-positive" : "text-negative";
  const arrow = flat ? "→" : value > 0 ? "↑" : "↓";
  return (
    <span className={cn("tnum text-xs font-medium", tone, className)}>
      {arrow} {Math.abs(value * 100).toFixed(digits)}%
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: "critical" | "high" | "medium" | "low" }) {
  const v = priority === "critical" ? "negative" : priority === "high" ? "warning" : priority === "medium" ? "info" : "outline";
  return <Badge variant={v} className="uppercase tracking-wide">{priority}</Badge>;
}

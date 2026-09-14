import { cn } from "@/lib/utils/cn";

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "positive" | "warning" | "negative" }) {
  const v = Math.max(0, Math.min(100, value));
  const bar = tone === "positive" ? "bg-positive" : tone === "warning" ? "bg-warning" : tone === "negative" ? "bg-negative" : "bg-accent";
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${v}%` }} />
    </div>
  );
}

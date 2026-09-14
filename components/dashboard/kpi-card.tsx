import { Card } from "@/components/ui/card";
import { Delta } from "./status";
import { cn } from "@/lib/utils/cn";

export function KpiCard({ label, value, delta, invert, hint, emphasis = false, sub }: { label: string; value: string; delta?: number | null; invert?: boolean; hint?: string; emphasis?: boolean; sub?: string }) {
  return (
    <Card className={cn("flex flex-col gap-1 px-4 py-3", emphasis && "border-accent/30 bg-accent-soft/40")}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className={cn("tnum font-semibold tracking-tight", emphasis ? "text-2xl" : "text-xl")}>{value}</span>
      <span className="flex items-center gap-2 text-[11px] text-muted">
        {delta !== undefined ? <Delta value={delta} invert={invert} /> : null}
        {sub ? <span>{sub}</span> : hint ? <span>{hint}</span> : null}
      </span>
    </Card>
  );
}

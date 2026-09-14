import { Brain } from "lucide-react";
import type { ExecutiveSummary } from "@/agent/recommendations/executive-summary";
import { Card } from "@/components/ui/card";
import { Estimated } from "@/components/ui/misc";

export function AiSummaryPanel({ summary, windowLabel }: { summary: ExecutiveSummary; windowLabel: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden />
      <div className="flex flex-col gap-3 px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Brain className="size-3.5" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight">AI Executive Summary</h2>
          <span className="text-xs text-muted">· {windowLabel}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-2">Generated from live analysis</span>
        </div>
        <ol className="flex flex-col gap-2">
          {summary.sentences.map((s, i) => (
            <li key={i} className="text-[15px] leading-relaxed text-foreground">
              {s}
            </li>
          ))}
        </ol>
        <p className="flex items-center gap-2 text-[11px] text-muted">
          <Estimated /> Pipeline opportunity figures are projections from trailing unit economics, not guarantees.
        </p>
      </div>
    </Card>
  );
}

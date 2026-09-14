import type { FunnelStageSummary } from "@/types/domain";
import { fmtCompactCurrency, fmtCompactNumber, fmtCurrency, fmtPct } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const MONEY = new Set(["pipeline", "revenue"]);

/**
 * B2B revenue funnel. Bar width is log-scaled so impressions don't flatten
 * everything else; every stage shows volume, conversion, cost and value.
 */
export function FunnelView({ stages, compact = false }: { stages: FunnelStageSummary[]; compact?: boolean }) {
  const maxLog = Math.log10(Math.max(...stages.map((s) => s.volume), 10) + 1);
  return (
    <ol className="flex flex-col gap-1.5">
      {stages.map((s, i) => {
        const money = MONEY.has(s.stage);
        const width = Math.min(72, Math.max(4, (Math.log10(s.volume + 1) / maxLog) * 72));
        return (
          <li key={s.stage} className="grid grid-cols-[7rem_1fr] items-center gap-3 md:grid-cols-[8rem_1fr_9rem_8rem_8rem]">
            <div className="text-xs">
              <span className="text-muted-2">{i + 1}.</span> <span className="font-medium">{s.label}</span>
            </div>
            <div className="relative flex h-7 min-w-0 items-center gap-2 overflow-hidden rounded-md bg-surface-2">
              <div
                className={cn("h-full shrink-0 rounded-md", money ? "bg-positive" : "bg-accent")}
                style={{ width: `${width}%`, opacity: 0.55 + 0.45 * (i / (stages.length - 1)) }}
                aria-hidden
              />
              <span className="tnum shrink-0 pr-2 text-[12px] font-semibold">{money ? fmtCompactCurrency(s.volume) : fmtCompactNumber(s.volume)}</span>
            </div>
            {!compact ? (
              <>
                <div className="tnum text-xs text-muted">
                  {s.conversionFromPrevious !== null ? (
                    <>
                      <span className="text-foreground">{fmtPct(s.conversionFromPrevious, s.conversionFromPrevious < 0.01 ? 2 : 1)}</span> {s.stage === "revenue" ? "win rate" : "conv."}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="tnum text-xs text-muted">{s.costPer !== null ? <><span className="text-foreground">{fmtCurrency(s.costPer, { cents: s.costPer < 10 })}</span> each</> : "—"}</div>
                <div className="tnum text-xs text-muted">{s.value !== null ? <><span className="text-foreground">{fmtCompactCurrency(s.value)}</span> value</> : "—"}</div>
              </>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

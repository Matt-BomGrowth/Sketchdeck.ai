"use client";

import { useMemo, useState } from "react";
import type { RankedCampaign } from "@/agent/optimizers/budget-optimizer";
import { simulateReallocation } from "@/agent/optimizers/simulator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Estimated } from "@/components/ui/misc";
import { fmtCompactCurrency, fmtCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function BudgetSimulator({ sources, targets, windowDays, defaultAmount }: { sources: RankedCampaign[]; targets: RankedCampaign[]; windowDays: number; defaultAmount: number }) {
  const maxAmount = Math.max(1000, Math.round(sources.reduce((s, r) => s + r.totals.spend, 0)));
  const [amount, setAmount] = useState(Math.min(defaultAmount, maxAmount));
  const result = useMemo(() => simulateReallocation({ amount, windowDays, sources, targets }), [amount, windowDays, sources, targets]);
  const rows: Array<{ label: string; key: keyof typeof result.net; money?: boolean }> = [
    { label: "MQLs", key: "mqls" },
    { label: "SQLs", key: "sqls" },
    { label: "Opportunities", key: "opportunities" },
    { label: "Pipeline", key: "pipeline", money: true },
    { label: "Revenue", key: "revenue", money: true },
  ];
  return (
    <Card id="simulator">
      <CardHeader>
        <CardTitle>What if? · Budget simulator</CardTitle>
        <CardDescription>
          Move budget from the bottom 30% ({sources.length} campaigns) to the top performers ({targets.length}) and estimate the funnel impact over {windowDays} days. All projections are <Estimated />.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-xs font-medium text-muted" htmlFor="sim-amount">Move</label>
          <span className="tnum text-2xl font-semibold tracking-tight">{fmtCurrency(amount)}</span>
          <div className="min-w-56 flex-1">
            <Slider id="sim-amount" min={500} max={maxAmount} step={500} value={[amount]} onValueChange={(v) => setAmount(v[0] ?? amount)} aria-label="Budget to move" />
          </div>
          <Badge variant={result.confidenceLabel === "High" ? "positive" : result.confidenceLabel === "Medium" ? "warning" : "negative"}>
            Confidence {result.confidenceLabel} · {Math.round(result.confidence * 100)}%
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-5">
          {rows.map((r) => {
            const net = result.net[r.key];
            const positive = net >= 0;
            return (
              <div key={r.key} className="rounded-md border border-border bg-surface-2 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{r.label}</p>
                <p className={cn("tnum text-lg font-semibold", positive ? "text-positive" : "text-negative")}>
                  {positive ? "+" : "−"}
                  {r.money ? fmtCompactCurrency(Math.abs(net)) : Math.abs(net).toFixed(1)}
                </p>
                <p className="tnum text-[11px] text-muted">
                  −{r.money ? fmtCompactCurrency(result.removed[r.key]) : result.removed[r.key].toFixed(1)} / +{r.money ? fmtCompactCurrency(result.added[r.key]) : result.added[r.key].toFixed(1)}
                </p>
              </div>
            );
          })}
        </div>
        <ul className="flex flex-col gap-1 text-[11px] text-muted">
          {result.notes.map((n, i) => (
            <li key={i}>• {n}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import type { WhyChangedReport } from "@/agent/analyzers/why-changed";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "./status";
import { fmtCompactCurrency, fmtPct } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function WhyChangedPanel({ report, compact = false }: { report: WhyChangedReport; compact?: boolean }) {
  const tone = report.direction === "up" ? "text-positive" : report.direction === "down" ? "text-negative" : "text-muted";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Why did performance change?</CardTitle>
        <CardDescription>{report.metricLabel} decomposed by campaign, then by driver.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className={cn("text-[15px] font-medium leading-snug", tone)}>{report.headline}</p>
        {report.contributors.length === 0 ? (
          <p className="text-xs text-muted">No campaign moved materially in this period.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {report.contributors.slice(0, compact ? 2 : 4).map((c) => (
              <li key={c.campaign.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <PlatformBadge platform={c.campaign.platform} short />
                  <Link href={`/campaigns/${c.campaign.id}`} className="min-w-0 text-sm font-medium hover:underline">
                    {c.campaign.name}
                  </Link>
                  <span className="ml-auto tnum text-xs text-muted">
                    {c.shareOfChange > 0 ? `${fmtPct(c.shareOfChange, 0)} of the ${report.direction === "up" ? "gain" : "decline"} · ` : ""}
                    {fmtCompactCurrency(c.previous[report.metric])} → {fmtCompactCurrency(c.current[report.metric])}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.drivers.length === 0 ? <span className="text-xs text-muted">No single driver stands out.</span> : null}
                  {c.drivers.map((d) => (
                    <Badge key={d.key} variant={d.hurts ? "negative" : "positive"}>
                      {d.text}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted">
                  <span className="font-medium text-foreground">Recommendation:</span> {c.recommendation}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import type { ReportIntegrity } from "@/lib/reports/weekly";
import type { FocusItem } from "@/lib/reports/weekly-narrative";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtDateTime } from "@/lib/utils/format";

/** Section 6: the week in plain English, built only from the report's numbers. */
export function SummarySection({ sentences, windowLabel }: { sentences: string[]; windowLabel: string }) {
  return (
    <Card className="relative overflow-hidden border-accent/30">
      <div className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden />
      <CardHeader>
        <CardTitle>Performance summary</CardTitle>
        <CardDescription>What changed {windowLabel}, what drove it, and whether efficiency improved. Generated from the numbers above, not a template.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {sentences.map((s, i) => (
            <li key={i} className="text-[15px] leading-relaxed">
              {s}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

const SCOPE_LABEL: Record<FocusItem["scope"], string> = { blended: "Blended", platform: "Platform", campaign: "Campaign", ad: "Ad" };

/** Section 7: things worth investigating next period, each with the numbers behind it. */
export function NextFocusSection({ items }: { items: FocusItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Next focus</CardTitle>
        <CardDescription>Movements worth a look next week. These describe what the data shows; whether each one is a problem depends on context you have and the report doesn&apos;t.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Nothing moved enough to single out this period.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {items.map((f, i) => (
              <li key={f.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="tnum w-5 shrink-0 text-xs text-muted-2">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  {f.campaignId ? (
                    <Link href={`/campaigns/${f.campaignId}`} className="text-sm font-medium hover:underline">
                      {f.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{f.title}</p>
                  )}
                  <p className="text-xs text-muted">{f.detail}</p>
                </div>
                <Badge variant="outline" className="h-fit shrink-0">
                  {SCOPE_LABEL[f.scope]}
                </Badge>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Data source, periods, sync time and anything missing — always visible so the report can be shared as is. */
export function IntegrityBlock({ integrity }: { integrity: ReportIntegrity }) {
  const period = (w: { start: string; end: string }) => `${fmtDate(w.start, { month: "short", day: "numeric" })} – ${fmtDate(w.end, { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-4 py-3 text-xs text-muted">
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Reporting period</dt>
          <dd className="text-foreground">{period(integrity.reportingPeriod)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Compared with</dt>
          <dd className="text-foreground">{period(integrity.comparisonPeriod)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Data source</dt>
          <dd className="text-foreground">{integrity.sources.length ? integrity.sources.join(" · ") : "No ad platform connected"}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Last synced</dt>
          <dd className="text-foreground">{integrity.lastSyncAt ? fmtDateTime(integrity.lastSyncAt) : "Never"}</dd>
        </div>
      </dl>
      {integrity.notes.length ? (
        <ul className="mt-2 flex list-disc flex-col gap-0.5 pl-4">
          {integrity.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-2">CTR = clicks ÷ impressions · CPC = spend ÷ clicks · CPM = spend ÷ impressions × 1,000 · Cost per conversion = spend ÷ conversions. Blended rates use summed totals.</p>
    </div>
  );
}

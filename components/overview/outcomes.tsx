import Link from "next/link";
import type { AnalysisSnapshot } from "@/lib/analytics/snapshot";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Kpi } from "./metric-cell";
import { AiSummaryPanel } from "@/components/dashboard/ai-summary";

/**
 * Section 8: business outcomes. Pipeline, revenue and ROAS stay on the page
 * but as the outcomes layer under the channel detail, not the headline.
 */
export function OutcomesSection({ s }: { s: AnalysisSnapshot }) {
  const t = s.totals;
  const p = s.previousTotals;
  return (
    <Card id="outcomes">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Business outcomes</CardTitle>
          <CardDescription>What the channels above produced, {s.window.label} vs. {s.previousWindow.label}. Attributed from HubSpot to paid campaigns.</CardDescription>
        </div>
        <Link href="/pipeline">
          <Button size="xs" variant="ghost">
            Pipeline &amp; revenue →
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Pipeline" value={t.pipeline} previous={p.pipeline} format="compactCurrency" />
          <Kpi label="Revenue" value={t.revenue} previous={p.revenue} format="compactCurrency" />
          <Kpi label="Pipeline ROAS" value={s.derived.pipelineRoas} previous={s.previousDerived.pipelineRoas} format="multiple" />
          <Kpi label="Revenue ROAS" value={s.derived.roas} previous={s.previousDerived.roas} format="multiple" />
          <Kpi label="Cost / SQL" value={s.derived.costPerSql} previous={s.previousDerived.costPerSql} format="currency" invert />
          <Kpi label="Cost / opportunity" value={s.derived.costPerOpportunity} previous={s.previousDerived.costPerOpportunity} format="currency" invert />
        </div>
        <AiSummaryPanel summary={s.summary} windowLabel={s.window.label} />
      </CardContent>
    </Card>
  );
}

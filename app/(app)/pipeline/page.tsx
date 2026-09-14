import { getPageSnapshot, windowDaysFrom } from "@/lib/analytics/page-snapshot";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { FunnelView } from "@/components/pipeline/funnel";
import { LeadQualityPanel } from "@/components/pipeline/lead-quality";
import { WhyChangedPanel } from "@/components/dashboard/why-changed";
import { PipelineTrendChart } from "@/components/charts/pipeline-trend";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SKETCHDECK } from "@/data/demo/sketchdeck";
import { pctChange } from "@/lib/calculations/metrics";
import { fmtCompactCurrency, fmtMultiple, fmtNumber, fmtPct } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { days, key } = windowDaysFrom((await searchParams).window);
  const s = await getPageSnapshot(days);
  const t = s.totals;
  const p = s.previousTotals;
  const trend = s.series.map((d) => ({ date: d.date, pipeline: d.pipeline, spend: d.spend, sqls: d.sqls }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="B2B Revenue Funnel" subtitle="Ad Spend → Lead → MQL → SQL → Opportunity → Pipeline → Revenue" windowKey={key} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Pipeline" value={fmtCompactCurrency(t.pipeline)} delta={pctChange(t.pipeline, p.pipeline)} emphasis />
        <KpiCard label="Revenue" value={fmtCompactCurrency(t.revenue)} delta={pctChange(t.revenue, p.revenue)} emphasis />
        <KpiCard label="Pipeline ROAS" value={fmtMultiple(s.derived.pipelineRoas)} delta={pctChange(s.derived.pipelineRoas ?? 0, s.previousDerived.pipelineRoas ?? 0)} />
        <KpiCard label="Win rate" value={fmtPct(s.funnel.find((f) => f.stage === "revenue")?.conversionFromPrevious ?? null, 0)} sub="revenue / pipeline" />
        <KpiCard label="SQLs" value={fmtNumber(t.sqls)} delta={pctChange(t.sqls, p.sqls)} sub={`${fmtPct(s.derived.sqlRate, 0)} of MQLs`} />
        <KpiCard label="Opportunities" value={fmtNumber(t.opportunities)} delta={pctChange(t.opportunities, p.opportunities)} sub={`${fmtPct(s.derived.opportunityRate, 0)} of SQLs`} />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Funnel · {s.window.label}</CardTitle>
          <CardDescription>Every stage shows volume, conversion from the previous stage, cost per unit and value.</CardDescription>
        </CardHeader>
        <CardContent>
          <FunnelView stages={s.funnel} />
          <dl className="mt-4 grid gap-2 border-t border-border pt-3 text-[11px] text-muted md:grid-cols-3">
            {Object.entries(SKETCHDECK.pipelineStages).map(([k, v]) => (
              <div key={k}>
                <dt className="font-medium uppercase tracking-wide text-muted-2">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <LeadQualityPanel report={s.leadQuality} />
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3"><WhyChangedPanel report={s.whyChangedWindow} /></div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline vs. spend</CardTitle>
            <CardDescription>Daily, {s.window.label}.</CardDescription>
          </CardHeader>
          <CardContent><PipelineTrendChart data={trend} /></CardContent>
        </Card>
      </section>
    </div>
  );
}

import Link from "next/link";
import { getPageSnapshot, windowDaysFrom } from "@/lib/analytics/page-snapshot";
import { getRepository } from "@/lib/data";
import { pctChange } from "@/lib/calculations/metrics";
import { fmtCompactCurrency, fmtMultiple, fmtNumber, fmtRelative, PLATFORM_LABEL } from "@/lib/utils/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AiSummaryPanel } from "@/components/dashboard/ai-summary";
import { WhyChangedPanel } from "@/components/dashboard/why-changed";
import { BudgetOpportunities, NeedsAttention, TopCampaigns } from "@/components/dashboard/attention";
import { RecentAiActivity } from "@/components/agent/recent-actions";
import { PipelineTrendChart } from "@/components/charts/pipeline-trend";
import { PlatformBarsChart } from "@/components/charts/platform-bars";
import { FunnelView } from "@/components/pipeline/funnel";
import { CampaignTable } from "@/components/campaigns/campaign-table";
import { toTableRows } from "@/components/campaigns/rows";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deriveMetrics } from "@/lib/calculations/metrics";
import type { Platform } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function CommandCenter({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { days, key } = windowDaysFrom(sp.window);
  const repo = await getRepository();
  const [s, runs, actions, storedRecs] = await Promise.all([getPageSnapshot(days), repo.getScanRuns(1), repo.getActions(), repo.getRecommendations()]);
  const t = s.totals;
  const p = s.previousTotals;
  const last = runs[0];
  const lastScanAt = last?.finishedAt ?? last?.startedAt;
  const nextScanAt = lastScanAt ? new Date(new Date(lastScanAt).getTime() + 3600_000).toISOString() : undefined;
  const recs = storedRecs.length ? storedRecs : s.recommendations;

  const platformBars = (["google", "meta", "linkedin"] as Platform[]).map((pl) => {
    const tot = s.byPlatform.get(pl)!;
    const m = deriveMetrics(tot);
    return { platform: pl, label: PLATFORM_LABEL[pl].replace(" Ads", ""), spend: tot.spend, pipeline: tot.pipeline, pipelineRoas: m.pipelineRoas === null ? 0 : Math.round(m.pipelineRoas * 10) / 10, sqls: tot.sqls };
  });
  const trend = s.series.map((d) => ({ date: d.date, pipeline: d.pipeline, spend: d.spend, sqls: d.sqls }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="B2B Marketing Command Center" subtitle="From ad spend to pipeline — automatically." windowKey={key}>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/40 bg-positive-soft px-2.5 py-1 font-semibold tracking-wide text-positive">
            <span className="pulse-dot size-1.5 rounded-full bg-positive" aria-hidden />
            AI AGENT ACTIVE
          </span>
          <span>
            Last scan <span className="font-medium text-foreground">{lastScanAt ? fmtRelative(lastScanAt) : "—"}</span>
          </span>
          <span>
            Next scan <span className="font-medium text-foreground">{nextScanAt ? fmtRelative(nextScanAt) : "—"}</span>
          </span>
          <span>
            {s.campaigns.filter((c) => c.campaign.status === "active").length} active campaigns · {s.window.start} → {s.window.end}
          </span>
        </div>
      </PageHeader>

      {/* 1–3: Pipeline, Revenue, Pipeline ROAS lead the hierarchy */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" aria-label="Key performance indicators">
        <KpiCard label="Pipeline" value={fmtCompactCurrency(t.pipeline)} delta={pctChange(t.pipeline, p.pipeline)} emphasis sub="vs. prior period" />
        <KpiCard label="Revenue" value={fmtCompactCurrency(t.revenue)} delta={pctChange(t.revenue, p.revenue)} emphasis sub="closed won" />
        <KpiCard label="Pipeline ROAS" value={fmtMultiple(s.derived.pipelineRoas)} delta={pctChange(s.derived.pipelineRoas ?? 0, s.previousDerived.pipelineRoas ?? 0)} emphasis sub="pipeline / spend" />
        <KpiCard label="Revenue ROAS" value={fmtMultiple(s.derived.roas)} delta={pctChange(s.derived.roas ?? 0, s.previousDerived.roas ?? 0)} sub="revenue / spend" />
        <KpiCard label="Spend" value={fmtCompactCurrency(t.spend)} delta={pctChange(t.spend, p.spend)} invert sub="all platforms" />
        <KpiCard label="MQLs" value={fmtNumber(t.mqls)} delta={pctChange(t.mqls, p.mqls)} sub={`${fmtCompactCurrency(s.derived.costPerMql)} each`} />
        <KpiCard label="SQLs" value={fmtNumber(t.sqls)} delta={pctChange(t.sqls, p.sqls)} sub={`${fmtCompactCurrency(s.derived.costPerSql)} each`} />
        <KpiCard label="Opportunities" value={fmtNumber(t.opportunities)} delta={pctChange(t.opportunities, p.opportunities)} sub={`${fmtCompactCurrency(s.derived.costPerOpportunity)} each`} />
      </section>

      {/* 4: AI summary */}
      <AiSummaryPanel summary={s.summary} windowLabel={s.window.label} />

      {/* 5–7: Problems, opportunities, top campaigns */}
      <section className="grid gap-4 lg:grid-cols-3">
        <NeedsAttention rows={s.campaigns} critical={s.alerts.critical} warnings={s.alerts.warnings} />
        <BudgetOpportunities plan={s.plan} />
        <TopCampaigns rows={s.campaigns} />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <WhyChangedPanel report={s.whyChanged} />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline vs. spend</CardTitle>
            <CardDescription>Daily, {s.window.label}. Solid: pipeline · dashed: spend.</CardDescription>
          </CardHeader>
          <CardContent>
            <PipelineTrendChart data={trend} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>B2B revenue funnel</CardTitle>
              <CardDescription>Impressions → Clicks → Leads → MQLs → SQLs → Opportunities → Pipeline → Revenue</CardDescription>
            </div>
            <Link href={`/pipeline?window=${key}`}>
              <Button size="xs" variant="ghost">
                Full funnel →
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <FunnelView stages={s.funnel} compact />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline ROAS by channel</CardTitle>
            <CardDescription>Which channel generates the best pipeline per dollar.</CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformBarsChart data={platformBars} />
            <ul className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted">
              {platformBars.map((b) => (
                <li key={b.platform} className="tnum">
                  <span className="font-medium text-foreground">{b.label}</span>
                  <br />
                  {fmtCompactCurrency(b.spend)} → {fmtCompactCurrency(b.pipeline)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* 8: Campaigns */}
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Campaigns</CardTitle>
            <CardDescription>Top 8 by pipeline quality. Sort and filter the full table on the Campaigns page.</CardDescription>
          </div>
          <Link href={`/campaigns?window=${key}`}>
            <Button size="xs" variant="ghost">
              All {s.campaigns.length} campaigns →
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <CampaignTable rows={toTableRows(s.campaigns).filter((r) => r.status === "active").sort((a, b) => a.qualityRank - b.qualityRank).slice(0, 8)} compact />
        </CardContent>
      </Card>

      {/* 9: Recent AI actions */}
      <RecentAiActivity actions={actions} recommendations={recs} />
    </div>
  );
}

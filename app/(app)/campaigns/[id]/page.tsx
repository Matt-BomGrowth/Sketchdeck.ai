import Link from "next/link";
import { notFound } from "next/navigation";
import { getPageSnapshot, windowDaysFrom } from "@/lib/analytics/page-snapshot";
import { getRepository } from "@/lib/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { FatiguePill, HealthPill, PlatformBadge } from "@/components/dashboard/status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PipelineTrendChart } from "@/components/charts/pipeline-trend";
import { FunnelView } from "@/components/pipeline/funnel";
import { RecommendationCard } from "@/components/agent/recommendation-card";
import { CreativeCard } from "@/components/creatives/creative-card";
import { buildFunnel } from "@/lib/calculations/funnel";
import { pctChange } from "@/lib/calculations/metrics";
import { dailySeries } from "@/lib/analytics/aggregate";
import { windowEnding } from "@/lib/utils/dates";
import { fmtCompactCurrency, fmtCurrency, fmtMultiple, fmtNumber, fmtPct, fmtSignedPct } from "@/lib/utils/format";
import { canApprove, getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const { days, key } = windowDaysFrom((await searchParams).window);
  const [s, repo, user] = await Promise.all([getPageSnapshot(days), getRepository(), getSessionUser()]);
  const row = s.campaigns.find((c) => c.campaign.id === id);
  if (!row) notFound();
  const metrics = await repo.getDailyMetrics(windowEnding(s.endDate, Math.max(days, 30)));
  const series = dailySeries(metrics, windowEnding(s.endDate, Math.max(days, 30)), new Set([id])).map((d) => ({ date: d.date, pipeline: d.pipeline, spend: d.spend, sqls: d.sqls }));
  const creatives = s.creatives.items.filter((i) => i.creative.campaignId === id);
  const c = row.campaign;
  const m = row.metrics;
  const prev = row.previous;
  const recs = s.recommendations.filter((r) => r.campaignId === id);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={c.name} windowKey={key}>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <PlatformBadge platform={c.platform} />
          <Badge variant="outline">{c.channelType}</Badge>
          <Badge variant="outline" className="capitalize">{c.status}</Badge>
          <span>{c.country}</span>·<span>{c.industry}</span>·<span>{c.icpSegment}</span>·<span className="tnum">{fmtCurrency(c.dailyBudget)}/day budget</span>
          <Link href="/campaigns" className="ml-2 text-accent hover:underline">← All campaigns</Link>
        </div>
      </PageHeader>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Pipeline" value={fmtCompactCurrency(row.totals.pipeline)} delta={pctChange(row.totals.pipeline, prev.pipeline)} emphasis />
        <KpiCard label="Pipeline ROAS" value={fmtMultiple(m.pipelineRoas)} emphasis sub={`acct ${fmtMultiple(s.derived.pipelineRoas)}`} />
        <KpiCard label="Revenue" value={fmtCompactCurrency(row.totals.revenue)} delta={pctChange(row.totals.revenue, prev.revenue)} />
        <KpiCard label="Spend" value={fmtCompactCurrency(row.totals.spend)} delta={pctChange(row.totals.spend, prev.spend)} invert />
        <KpiCard label="SQLs" value={fmtNumber(row.totals.sqls)} delta={pctChange(row.totals.sqls, prev.sqls)} sub={`${fmtCurrency(m.costPerSql)} each`} />
        <KpiCard label="MQLs" value={fmtNumber(row.totals.mqls)} delta={pctChange(row.totals.mqls, prev.mqls)} sub={`${fmtPct(m.mqlRate)} of leads`} />
        <KpiCard label="CTR" value={fmtPct(m.ctr, 2)} sub={`CPC ${fmtCurrency(m.cpc, { cents: true })}`} />
        <KpiCard label="Cost / lead" value={fmtCurrency(m.cpl)} sub={`${fmtNumber(row.totals.leads)} leads`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Health score</CardTitle>
            <CardDescription>0–100, benchmarked against the account. CTR carries 5% of the weight.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-end gap-3">
              <span className="tnum text-4xl font-semibold tracking-tight">{row.health.score}</span>
              <span className="pb-1.5 text-sm text-muted">/ 100</span>
              <span className="pb-1.5"><HealthPill score={row.health.score} status={row.health.status} label={row.health.label} /></span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {row.health.components.map((comp) => (
                <li key={comp.key} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-xs">
                  <span className="truncate text-muted">{comp.label} <span className="text-muted-2">({Math.round(comp.weight * 100)}%)</span></span>
                  <Progress value={comp.score} tone={comp.score >= 70 ? "positive" : comp.score >= 45 ? "warning" : "negative"} />
                  <span className="tnum text-right">{Math.round(comp.score)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fatigue</CardTitle>
            <CardDescription>Last {s.thresholds.lookbackDays} days vs. {s.thresholds.baselineDays}-day baseline.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="tnum text-4xl font-semibold tracking-tight">{row.fatigue.score}</span>
              <FatiguePill status={row.fatigue.status} />
            </div>
            <ul className="flex flex-col gap-1 text-xs">
              {row.fatigue.reasons.map((r, i) => (
                <li key={i} className="text-muted">• {r}</li>
              ))}
            </ul>
            <ul className="grid grid-cols-2 gap-1.5 text-xs">
              {row.fatigue.signals.map((sig) => (
                <li key={sig.key} className="flex items-center justify-between rounded-md bg-surface-2 px-2 py-1">
                  <span className="text-muted">{sig.label}</span>
                  <span className={sig.direction === "worse" ? "tnum text-negative" : sig.direction === "better" ? "tnum text-positive" : "tnum text-muted"}>{fmtSignedPct(sig.change)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
            <CardDescription>{s.window.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <FunnelView stages={buildFunnel(row.totals)} compact />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline vs. spend</CardTitle>
          <CardDescription>Daily for the last {Math.max(days, 30)} days.</CardDescription>
        </CardHeader>
        <CardContent>
          <PipelineTrendChart data={series} />
        </CardContent>
      </Card>

      {recs.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Next best actions</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {recs.map((r) => (
              <RecommendationCard key={r.id} rec={r} canDecide={canApprove(user)} />
            ))}
          </div>
        </section>
      ) : null}

      {creatives.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Creatives</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {creatives.map((i) => (
              <CreativeCard key={i.creative.id} item={i} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

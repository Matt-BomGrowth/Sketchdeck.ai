import { getWeeklyReportPage, reportDaysFrom } from "@/lib/reports/load-weekly";
import { PageHeader } from "@/components/dashboard/page-header";
import { WindowSelect } from "@/components/dashboard/window-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BlendedSection } from "@/components/report/blended";
import { PlatformSection } from "@/components/report/platforms";
import { CampaignWowTable } from "@/components/report/campaign-table";
import { AdsSection } from "@/components/report/ads";
import { TrendChart, TrendMinis } from "@/components/report/trends";
import { IntegrityBlock, NextFocusSection, SummarySection } from "@/components/report/narrative";
import type { ReportMetricKey } from "@/lib/reports/weekly";
import { fmtDate } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly Ad Performance Report" };

const PRESETS = [
  { key: "7d", label: "7 days" },
  { key: "14d", label: "14 days" },
  { key: "30d", label: "30 days" },
];

/**
 * Weekly Ad Performance Report.
 * Blended → Platform → Campaign → Creative → WoW trends → Summary → Next focus.
 */
export default async function WeeklyReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { days, key } = reportDaysFrom((await searchParams).window);
  const r = await getWeeklyReportPage(days);
  const hasSocial = r.blended.current.reach !== null || r.blended.previous.reach !== null;
  const available: ReportMetricKey[] = ["spend", "conversions", "costPerConversion", "ctr", "impressions", "clicks", "cpc", "cpm", ...(hasSocial ? (["reach", "frequency"] as ReportMetricKey[]) : [])];
  const title = days === 7 ? "Weekly Ad Performance Report" : `Ad Performance Report · last ${days} days`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={title} subtitle="How the ads performed, what changed, what drove it, and what to look at next." right={<WindowSelect current={key} presets={PRESETS} max={90} />}>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>
            <span className="font-medium text-foreground">
              {fmtDate(r.window.start)} – {fmtDate(r.window.end, { month: "short", day: "numeric", year: "numeric" })}
            </span>{" "}
            vs. {fmtDate(r.previous.start)} – {fmtDate(r.previous.end)}
          </span>
          <span>Data through {fmtDate(r.endDate, { month: "short", day: "numeric", year: "numeric" })} (complete days only)</span>
        </div>
      </PageHeader>

      {/* 1. Blended */}
      <BlendedSection report={r} />

      {/* 6–7 early: the two-minute answer sits right under the headline numbers. */}
      <section className="grid gap-4 xl:grid-cols-5" aria-label="Summary and next focus">
        <div className="xl:col-span-3">
          <SummarySection sentences={r.summary} windowLabel={r.window.label} />
        </div>
        <div className="xl:col-span-2">
          <NextFocusSection items={r.nextFocus} />
        </div>
      </section>

      {/* 2. Platform */}
      <PlatformSection report={r} />

      {/* 3. Campaigns */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign performance</CardTitle>
          <CardDescription>Every campaign with spend or impressions in either period. Click a column to sort; use the quick views to find what moved.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <CampaignWowTable rows={r.campaigns} platforms={r.integrity.connectedPlatforms} blendedSpend={r.blended.current.spend} />
        </CardContent>
      </Card>

      {/* 4. Ads */}
      <AdsSection report={r} />

      {/* 5. Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Week-over-week trends</CardTitle>
          <CardDescription>Daily values for {r.window.label} (solid) against the same day of {r.previous.label} (dashed).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TrendMinis trend={r.trend} windowLabel={r.window.label} previousLabel={r.previous.label} />
          <TrendChart trend={r.trend} windowLabel={r.window.label} previousLabel={r.previous.label} available={available} />
        </CardContent>
      </Card>

      {/* Data integrity */}
      <IntegrityBlock integrity={r.integrity} />
    </div>
  );
}

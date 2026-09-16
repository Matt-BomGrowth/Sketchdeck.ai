import { getPageSnapshot, windowDaysFrom } from "@/lib/analytics/page-snapshot";
import { getPageChannelDetail } from "@/lib/analytics/load-channel-detail";
import { getRepository } from "@/lib/data";
import { fmtRelative } from "@/lib/utils/format";
import { PageHeader } from "@/components/dashboard/page-header";
import { ChannelTable } from "@/components/overview/channel-table";
import { NeedsAttentionPanel, OpportunitiesPanel } from "@/components/overview/signals";
import { TimelineChart } from "@/components/overview/timeline";
import { GoogleAdsAlerts, GoogleAdsSection } from "@/components/overview/google-ads";
import { PaidSocialSection } from "@/components/overview/paid-social";
import { AnalyticsSection, SeoSection } from "@/components/overview/analytics";
import { CrmSection, UnifiedFunnelSection } from "@/components/overview/crm";
import { OutcomesSection } from "@/components/overview/outcomes";
import { RecentAiActivity } from "@/components/agent/recent-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Overview — the redesigned homepage.
 *
 * Hierarchy: 1) channel overview vs. prior period, 2) what needs attention /
 * opportunities, 3) Google Ads detail, 4) Meta (not connected until it is),
 * 5) GA4, 6) SEO, 7) CRM funnel by source + unified funnel, 8) business
 * outcomes (pipeline, revenue, ROAS) as the last layer.
 */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { days, key } = windowDaysFrom(sp.window);
  const repo = await getRepository();
  const [s, d, runs, actions, storedRecs] = await Promise.all([
    getPageSnapshot(days),
    getPageChannelDetail(days),
    repo.getScanRuns(1),
    repo.getActions(),
    repo.getRecommendations(),
  ]);
  const last = runs[0];
  const lastScanAt = last?.finishedAt ?? last?.startedAt;
  const recs = storedRecs.length ? storedRecs : s.recommendations;
  const integration = (k: string) => d.integrations.find((i) => i.key === k);
  const connected = (k: string) => {
    const i = integration(k);
    return i?.health === "connected" || i?.health === "demo";
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Overview" subtitle="Every channel, what changed, and what to do about it." windowKey={key}>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>
            {s.window.start} → {s.window.end}
          </span>
          <span>
            vs.{" "}
            <span className="font-medium text-foreground">
              {d.previous.start} → {d.previous.end}
            </span>
          </span>
          <span>
            Last scan <span className="font-medium text-foreground">{lastScanAt ? fmtRelative(lastScanAt) : "—"}</span>
            {last?.status === "partial" ? (
              <span className="ml-1 text-warning">
                (partial: {last.errors.length} source{last.errors.length === 1 ? "" : "s"} failed)
              </span>
            ) : null}
          </span>
        </div>
      </PageHeader>

      {/* 1. Channel overview */}
      <ChannelTable rows={d.channels} windowLabel={s.window.label} previousLabel={d.previous.label} />

      {/* 2. Timeline + attention + opportunities */}
      <Card>
        <CardHeader>
          <CardTitle>Performance timeline</CardTitle>
          <CardDescription>Daily, {s.window.label}. Solid: this period · dashed: the same day in the prior period.</CardDescription>
        </CardHeader>
        <CardContent>
          <TimelineChart data={d.timeline} windowLabel={s.window.label} previousLabel={d.previous.label} />
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Attention and opportunities">
        <NeedsAttentionPanel campaigns={s.campaigns} signals={d.attention} />
        <OpportunitiesPanel plan={s.plan} signals={d.opportunities} />
      </section>

      {/* 3. Google Ads */}
      <GoogleAdsSection detail={d.googleAds} campaigns={s.campaigns} windowKey={key} connected={connected("notfair") || connected("google_ads")} />
      <GoogleAdsAlerts signals={d.signals} />

      {/* 4. Paid social */}
      <PaidSocialSection platform="meta" title="Meta Ads" campaigns={s.campaigns} integration={integration("meta")} windowKey={key} />
      <PaidSocialSection platform="linkedin" title="LinkedIn Ads" campaigns={s.campaigns} integration={integration("linkedin")} windowKey={key} />

      {/* 5–6. Analytics + SEO */}
      <AnalyticsSection ga4={d.ga4} integration={integration("ga4")} signals={d.signals} />
      <SeoSection sc={d.searchConsole} integration={integration("search_console")} signals={d.signals} />

      {/* 7. CRM + unified funnel */}
      <CrmSection crm={d.crm} integration={integration("hubspot")} />
      <UnifiedFunnelSection stages={s.funnel} channels={d.channels} windowLabel={s.window.label} />

      {/* 8. Outcomes */}
      <OutcomesSection s={s} />

      <RecentAiActivity actions={actions} recommendations={recs} />
    </div>
  );
}

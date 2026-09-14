import { getPageSnapshot, windowDaysFrom } from "@/lib/analytics/page-snapshot";
import { getRepository } from "@/lib/data";
import { canApprove, getSessionUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { RecommendationCard } from "@/components/agent/recommendation-card";
import { BudgetSimulator } from "@/components/agent/simulator";
import { OptimizationLog } from "@/components/agent/optimization-log";
import { ScanNowButton } from "@/components/agent/scan-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Estimated } from "@/components/ui/misc";
import { PlatformBadge } from "@/components/dashboard/status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtCompactCurrency, fmtCurrency, fmtMultiple, fmtRelative } from "@/lib/utils/format";
import type { OptimizationAction, Recommendation } from "@/types/domain";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Agent" };

function countRecentApproved(actions: OptimizationAction[], days = 7) {
  const cutoff = Date.now() - days * 86400_000;
  return actions.filter((a) => ["approved", "executed", "measured"].includes(a.status) && new Date(a.createdAt).getTime() >= cutoff).length;
}

export default async function AgentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { days, key } = windowDaysFrom(sp.window);
  const highlight = typeof sp.rec === "string" ? sp.rec : undefined;
  const [s, repo, user] = await Promise.all([getPageSnapshot(days), getRepository(), getSessionUser()]);
  const [stored, actions, runs] = await Promise.all([repo.getRecommendations(), repo.getActions(), repo.getScanRuns(24)]);

  // Merge stored decisions onto the freshly generated recommendations (ids are stable per campaign/type).
  const byId = new Map(stored.map((r) => [r.id, r]));
  const recs: Recommendation[] = s.recommendations.map((r) => byId.get(r.id) ?? r);
  const pending = recs.filter((r) => r.status === "pending");
  const decided = recs.filter((r) => r.status !== "pending");
  const approvedToday = countRecentApproved(actions);
  const wasteAvoided = recs.reduce((sum, r) => sum + (r.expectedImpact.wasteAvoided ?? 0), 0);
  const pipelineOpp = recs.filter((r) => r.type === "budget_increase").reduce((sum, r) => sum + r.expectedImpact.pipelineHigh, 0);
  const issues = runs[0]?.issuesDetected ?? s.alerts.critical + s.alerts.warnings + s.alerts.anomalies;
  const measured = actions.filter((a) => a.status === "measured");
  const executed = actions.filter((a) => ["executed", "measured"].includes(a.status));
  const plan = s.plan;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="AI Agent" windowKey={key} right={<ScanNowButton />}>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/40 bg-positive-soft px-2.5 py-1 font-semibold tracking-wide text-positive">
            <span className="pulse-dot size-1.5 rounded-full bg-positive" aria-hidden />
            ACTIVE
          </span>
          <span>OBSERVE → RECOMMEND → APPROVE → EXECUTE → MEASURE</span>
          <span>Last scan {runs[0] ? fmtRelative(runs[0].finishedAt ?? runs[0].startedAt) : "—"}</span>
        </div>
      </PageHeader>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Issues detected" value={String(issues)} sub="latest scan" />
        <KpiCard label="Recommendations" value={String(recs.length)} sub={`${pending.length} awaiting approval`} />
        <KpiCard label="Approved actions" value={String(approvedToday)} sub="last 7 days" />
        <KpiCard label="Est. waste avoided" value={fmtCompactCurrency(wasteAvoided)} sub="per month if approved" />
        <KpiCard label="Pipeline opportunity" value={fmtCompactCurrency(pipelineOpp)} sub="upper estimate" emphasis />
      </section>

      <Tabs defaultValue={highlight ? "actions" : "actions"}>
        <TabsList>
          <TabsTrigger value="actions">Next best actions ({pending.length})</TabsTrigger>
          <TabsTrigger value="optimizer">Budget optimizer</TabsTrigger>
          <TabsTrigger value="log">Optimization log ({actions.length})</TabsTrigger>
          <TabsTrigger value="impact">AI impact</TabsTrigger>
        </TabsList>

        <TabsContent value="actions" className="flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {pending.map((r) => (
              <RecommendationCard key={r.id} rec={r} canDecide={canApprove(user)} highlight={r.id === highlight} />
            ))}
            {pending.length === 0 ? <p className="text-sm text-muted">No pending recommendations. Run a scan to refresh.</p> : null}
          </div>
          {decided.length ? (
            <details className="rounded-lg border border-border bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium">Decided this session ({decided.length})</summary>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {decided.map((r) => (
                  <RecommendationCard key={r.id} rec={r} canDecide={false} />
                ))}
              </div>
            </details>
          ) : null}
        </TabsContent>

        <TabsContent value="optimizer" className="flex flex-col gap-4" id="optimizer">
          <Card>
            <CardHeader>
              <CardTitle>AI Budget Optimizer</CardTitle>
              <CardDescription>
                Move {Math.round(plan.reallocationPct * 100)}% of eligible budget from the bottom 30% to the top 3. <Badge variant="accent">Requires approval</Badge>
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-[1fr_auto_1fr]">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-negative">Bottom 30% · −{fmtCurrency(plan.totalMoveDaily)}/day</p>
                <ul className="flex flex-col gap-1.5">
                  {plan.decreases.map((m) => (
                    <li key={m.campaignId} className="flex items-center gap-2 text-xs">
                      <PlatformBadge platform={m.platform} short />
                      <span className="truncate" title={m.campaignName}>{m.campaignName}</span>
                      <span className="tnum ml-auto text-muted">{fmtCurrency(m.currentDaily)} → {fmtCurrency(m.proposedDaily)}</span>
                      <span className="tnum font-medium text-negative">{fmtCurrency(m.deltaDaily)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col items-center justify-center gap-1 text-center">
                <span className="tnum text-3xl font-semibold tracking-tight">{fmtCompactCurrency(plan.totalMovePeriod)}</span>
                <span className="text-[11px] text-muted">over {plan.horizonDays} days</span>
                <span className="text-2xl text-muted-2" aria-hidden>→</span>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-positive">Top 3 · +{fmtCurrency(plan.totalMoveDaily)}/day</p>
                <ul className="flex flex-col gap-1.5">
                  {plan.increases.map((m) => {
                    const t = plan.top.find((x) => x.campaign.id === m.campaignId);
                    return (
                      <li key={m.campaignId} className="flex items-center gap-2 text-xs">
                        <PlatformBadge platform={m.platform} short />
                        <span className="truncate" title={m.campaignName}>{m.campaignName}</span>
                        <span className="tnum ml-auto text-muted">{t ? `${fmtMultiple(t.totals.pipeline / Math.max(t.totals.spend, 1))} pROAS · ` : ""}{fmtCurrency(m.currentDaily)} → {fmtCurrency(m.proposedDaily)}</span>
                        <span className="tnum font-medium text-positive">+{fmtCurrency(m.deltaDaily)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <ul className="text-[11px] text-muted lg:col-span-3">
                {plan.rationale.map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
                <li>• Approve the individual budget recommendations under “Next best actions” to execute this plan.</li>
              </ul>
            </CardContent>
          </Card>
          <BudgetSimulator sources={plan.bottom} targets={plan.top} windowDays={days} defaultAmount={Math.max(2000, Math.round(plan.totalMovePeriod / 500) * 500)} />
        </TabsContent>

        <TabsContent value="log">
          <OptimizationLog actions={actions} />
        </TabsContent>

        <TabsContent value="impact" className="flex flex-col gap-4">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <KpiCard label="Est. waste avoided" value={fmtCompactCurrency(wasteAvoided)} sub="per month, pending" />
            <KpiCard label="Incremental pipeline" value={`${fmtCompactCurrency(s.summary.opportunityLow)}–${fmtCompactCurrency(s.summary.opportunityHigh)}`} sub="opportunity, estimated" />
            <KpiCard label="Pipeline ROAS" value={fmtMultiple(s.derived.pipelineRoas)} delta={s.previousDerived.pipelineRoas ? (s.derived.pipelineRoas ?? 0) / s.previousDerived.pipelineRoas - 1 : null} sub="vs. prior period" />
            <KpiCard label="Actions executed" value={String(executed.length)} sub={`${measured.length} measured`} />
            <KpiCard label="Actions recommended" value={String(recs.length)} sub={`${decided.length} decided`} />
          </section>
          <Card>
            <CardHeader>
              <CardTitle>Measured outcomes</CardTitle>
              <CardDescription>Actual impact is recorded after a 14-day measurement window. Everything else is <Estimated />.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y divide-border">
                {measured.map((a) => (
                  <li key={a.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 md:grid-cols-[1fr_1fr]">
                    <div className="flex items-center gap-2 text-xs">
                      <PlatformBadge platform={a.platform} short />
                      <span className="font-medium">{a.campaignName}</span>
                      <span className="tnum text-muted">{a.before} → {a.after}</span>
                    </div>
                    <div className="text-xs">
                      <span className="text-muted">Expected: {a.expectedImpact}</span>
                      <br />
                      <span className="font-medium text-positive">Measured: {a.actualImpact}</span>
                    </div>
                  </li>
                ))}
                {measured.length === 0 ? <li className="text-xs text-muted">No measured actions yet.</li> : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import Link from "next/link";
import type { CampaignRow } from "@/lib/analytics/snapshot";
import type { BudgetPlan } from "@/agent/optimizers/budget-optimizer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FatiguePill, HealthPill, PlatformBadge } from "./status";
import { fmtCompactCurrency, fmtCurrency, fmtMultiple } from "@/lib/utils/format";
import { Estimated } from "@/components/ui/misc";

export function NeedsAttention({ rows, critical, warnings }: { rows: CampaignRow[]; critical: number; warnings: number }) {
  const list = rows
    .filter((r) => r.campaign.status === "active" && (r.fatigue.status !== "healthy" || r.health.status === "critical" || r.health.status === "at_risk"))
    .sort((a, b) => (b.fatigue.status === "critical" ? 1 : 0) - (a.fatigue.status === "critical" ? 1 : 0) || a.health.score - b.health.score)
    .slice(0, 4);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span aria-hidden>🔴</span> Needs attention
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-negative">{critical} critical</span> · <span className="font-medium text-warning">{warnings} warnings</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-border">
          {list.map((r) => (
            <li key={r.campaign.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-center gap-2">
                <PlatformBadge platform={r.campaign.platform} short />
                <Link href={`/campaigns/${r.campaign.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                  {r.campaign.name}
                </Link>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
                <FatiguePill status={r.fatigue.status} score={r.fatigue.score} />
                <HealthPill score={r.health.score} status={r.health.status} label={r.health.label} />
                <span className="min-w-0 basis-full truncate">{r.fatigue.status !== "healthy" ? r.fatigue.reasons[0] : `Pipeline ROAS ${fmtMultiple(r.metrics.pipelineRoas)}`}</span>
              </div>
            </li>
          ))}
          {list.length === 0 ? <li className="py-2 text-xs text-muted">No campaigns need attention right now.</li> : null}
        </ul>
      </CardContent>
    </Card>
  );
}

export function BudgetOpportunities({ plan }: { plan: BudgetPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span aria-hidden>💰</span> Budget opportunities
        </CardTitle>
        <CardDescription>
          <span className="tnum font-semibold text-foreground">{fmtCompactCurrency(plan.totalMovePeriod)}</span> recommended for reallocation over {plan.horizonDays} days · <Estimated />
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1.5">
          {plan.increases.map((m) => (
            <li key={m.campaignId} className="flex min-w-0 items-center gap-2 text-xs">
              <PlatformBadge platform={m.platform} short />
              <span className="min-w-0 truncate">{m.campaignName}</span>
              <span className="ml-auto tnum font-medium text-positive">+{fmtCurrency(m.deltaDaily)}/day</span>
            </li>
          ))}
          {plan.decreases.slice(0, 2).map((m) => (
            <li key={m.campaignId} className="flex min-w-0 items-center gap-2 text-xs">
              <PlatformBadge platform={m.platform} short />
              <span className="min-w-0 truncate text-muted">{m.campaignName}</span>
              <span className="ml-auto tnum font-medium text-negative">{fmtCurrency(m.deltaDaily)}/day</span>
            </li>
          ))}
          {plan.decreases.length > 2 ? <li className="text-[11px] text-muted">+ {plan.decreases.length - 2} more reductions across the bottom 30%</li> : null}
        </ul>
        <Link href="/agent#optimizer">
          <Button size="sm" variant="secondary" className="w-full">
            Review plan · requires approval
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export function TopCampaigns({ rows }: { rows: CampaignRow[] }) {
  const top = [...rows].filter((r) => r.campaign.status === "active").sort((a, b) => a.qualityRank - b.qualityRank).slice(0, 3);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span aria-hidden>🎯</span> Top campaigns
        </CardTitle>
        <CardDescription>Ranked by pipeline quality — not CTR.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col divide-y divide-border">
          {top.map((r, i) => (
            <li key={r.campaign.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="tnum w-4 text-xs text-muted-2">{i + 1}</span>
                <PlatformBadge platform={r.campaign.platform} short />
                <Link href={`/campaigns/${r.campaign.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                  {r.campaign.name}
                </Link>
              </div>
              <div className="tnum grid grid-cols-3 gap-2 pl-6 text-xs text-muted">
                <span>
                  <span className="font-medium text-foreground">{fmtMultiple(r.metrics.pipelineRoas)}</span> pipeline ROAS
                </span>
                <span>
                  <span className="font-medium text-foreground">{r.totals.sqls}</span> SQLs
                </span>
                <span>
                  <span className="font-medium text-foreground">{fmtCurrency(r.metrics.costPerSql)}</span> / SQL
                </span>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

import Link from "next/link";
import type { Signal } from "@/lib/analytics/channel-detail";
import type { CampaignRow } from "@/lib/analytics/snapshot";
import type { BudgetPlan } from "@/agent/optimizers/budget-optimizer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtCompactCurrency, fmtMultiple } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const AREA_LABEL: Record<Signal["area"], string> = { google_ads: "Google Ads", meta_ads: "Meta Ads", analytics: "Analytics", seo: "SEO", crm: "CRM" };

function severityBadge(s: Signal["severity"]) {
  return s === "critical" ? "negative" : s === "warning" ? "warning" : "info";
}

/**
 * "What needs attention": campaign-level problems from the AI scan
 * (fatigue, health, anomalies) merged with keyword / analytics / SEO rules.
 */
export function NeedsAttentionPanel({ campaigns, signals, limit = 6 }: { campaigns: CampaignRow[]; signals: Signal[]; limit?: number }) {
  const campaignItems: Signal[] = campaigns
    .filter((r) => r.campaign.status === "active" && (r.fatigue.status !== "healthy" || r.health.status === "critical" || r.health.status === "at_risk" || r.anomalies.some((a) => a.severity === "high")))
    .sort((a, b) => (b.fatigue.status === "critical" ? 1 : 0) - (a.fatigue.status === "critical" ? 1 : 0) || a.health.score - b.health.score)
    .map((r) => ({
      id: `campaign:${r.campaign.id}`,
      kind: "attention" as const,
      severity: r.fatigue.status === "critical" || r.anomalies.some((a) => a.severity === "high") ? ("critical" as const) : ("warning" as const),
      area: r.campaign.platform === "google" ? ("google_ads" as const) : ("meta_ads" as const),
      title: r.campaign.name,
      detail: r.fatigue.status !== "healthy" ? r.fatigue.reasons[0] : `Health ${r.health.score}/100 (${r.health.label}) · pipeline ROAS ${fmtMultiple(r.metrics.pipelineRoas)}`,
      href: `/campaigns/${r.campaign.id}`,
      campaignId: r.campaign.id,
      amount: r.totals.spend,
    }));
  const items = [...campaignItems, ...signals].sort((a, b) => rank(a.severity) - rank(b.severity) || (b.amount ?? 0) - (a.amount ?? 0));
  const counts = { critical: items.filter((i) => i.severity === "critical").length, warning: items.filter((i) => i.severity === "warning").length };
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span aria-hidden>🔴</span> What needs attention
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-negative">{counts.critical} critical</span> · <span className="font-medium text-warning">{counts.warning} warnings</span> · {items.length - counts.critical - counts.warning} to watch
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignalList items={diversify(items, limit)} empty="Nothing needs attention right now." />
        {items.length > limit ? <p className="mt-2 text-[11px] text-muted">+ {items.length - limit} more across Google Ads, Analytics and SEO.</p> : null}
      </CardContent>
    </Card>
  );
}

/** "Opportunities": budget reallocation from the optimizer plus keyword / search-term / SEO / landing-page upside. */
export function OpportunitiesPanel({ plan, signals, limit = 6 }: { plan: BudgetPlan; signals: Signal[]; limit?: number }) {
  const budget: Signal[] = plan.increases.slice(0, 2).map((m) => ({
    id: `budget:${m.campaignId}`,
    kind: "opportunity",
    severity: "info",
    area: m.platform === "google" ? "google_ads" : "meta_ads",
    title: `Move +${fmtCompactCurrency(m.deltaDaily)}/day to ${m.campaignName}`,
    detail: `Part of a ${fmtCompactCurrency(plan.totalMovePeriod)} reallocation over ${plan.horizonDays} days from the bottom 30% — requires approval`,
    href: "/agent#optimizer",
    campaignId: m.campaignId,
    amount: m.deltaPeriod,
  }));
  const items = [...signals, ...budget].sort((a, b) => rank(a.severity) - rank(b.severity) || (b.amount ?? 0) - (a.amount ?? 0));
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>
            <span aria-hidden>💡</span> Opportunities
          </CardTitle>
          <CardDescription>Where more of the same effort pays back: keywords to add or negate, pages to push, budget to move.</CardDescription>
        </div>
        <Link href="/agent#optimizer">
          <Button size="xs" variant="ghost">
            Budget plan →
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <SignalList items={diversify(items, limit)} empty="No opportunities detected in this window." />
        {items.length > limit ? <p className="mt-2 text-[11px] text-muted">+ {items.length - limit} more.</p> : null}
      </CardContent>
    </Card>
  );
}

export function SignalList({ items, empty, className }: { items: Signal[]; empty: string; className?: string }) {
  if (!items.length) return <p className={cn("py-2 text-xs text-muted", className)}>{empty}</p>;
  return (
    <ul className={cn("flex flex-col divide-y divide-border", className)}>
      {items.map((s) => (
        <li key={s.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-start gap-2">
            <Badge variant={severityBadge(s.severity)} className="mt-0.5 shrink-0 capitalize">
              {s.severity}
            </Badge>
            <div className="min-w-0 flex-1">
              {s.href ? (
                <Link href={s.href} className="block truncate text-sm font-medium hover:underline">
                  {s.title}
                </Link>
              ) : (
                <p className="truncate text-sm font-medium">{s.title}</p>
              )}
              <p className="text-xs text-muted">{s.detail}</p>
              {s.action ? <p className="text-[11px] text-muted-2">→ {s.action}</p> : null}
            </div>
            <span className="shrink-0 text-[11px] text-muted-2">{AREA_LABEL[s.area]}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function rank(s: Signal["severity"]) {
  return s === "critical" ? 0 : s === "warning" ? 1 : 2;
}

/**
 * Keep the panel representative: at most `perArea` items from any one area in
 * the first pass (critical items are never held back), then fill from the rest.
 */
function diversify(items: Signal[], limit: number, perArea = 3): Signal[] {
  const out: Signal[] = [];
  const perAreaCount = new Map<string, number>();
  const deferred: Signal[] = [];
  for (const s of items) {
    const n = perAreaCount.get(s.area) ?? 0;
    if (s.severity === "critical" || n < perArea) {
      out.push(s);
      perAreaCount.set(s.area, n + 1);
    } else deferred.push(s);
    if (out.length >= limit) return out;
  }
  return [...out, ...deferred].slice(0, limit);
}

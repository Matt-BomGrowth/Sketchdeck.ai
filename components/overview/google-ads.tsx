import Link from "next/link";
import type { ChannelDetail } from "@/lib/analytics/load-channel-detail";
import type { CampaignRow } from "@/lib/analytics/snapshot";
import { deriveMetrics, pctChange } from "@/lib/calculations/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Delta, FatiguePill, HealthPill } from "@/components/dashboard/status";
import { fmtCurrency, fmtNumber, fmtPct } from "@/lib/utils/format";
import { Compare, Kpi, NotConnected, fmtMetric } from "./metric-cell";
import { SignalList } from "./signals";

type GoogleAds = ChannelDetail["googleAds"];

/**
 * Section 2: Google Ads — account KPIs, campaigns, ad groups, keywords,
 * search terms, match types and the rule-based alerts for this window.
 */
export function GoogleAdsSection({
  detail,
  campaigns,
  windowKey,
  connected,
}: {
  detail: GoogleAds;
  campaigns: CampaignRow[];
  windowKey: string;
  connected: boolean;
}) {
  const google = campaigns.filter((r) => r.campaign.platform === "google");
  const active = google.filter((r) => r.campaign.status === "active");
  const acct = detail.account;
  const prev = detail.accountPrev;
  if (!connected && google.length === 0) {
    return (
      <Card id="google-ads">
        <CardHeader>
          <CardTitle>Google Ads</CardTitle>
        </CardHeader>
        <CardContent>
          <NotConnected
            title="Google Ads is not connected"
            description="Connect NotFair on the Integrations page and run a scan. Campaign, keyword and search-term data appear here after the first sync."
            action={
              <Link href="/integrations">
                <Button size="sm" variant="secondary">
                  Open Integrations
                </Button>
              </Link>
            }
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card id="google-ads">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Google Ads</CardTitle>
          <CardDescription>
            {active.length} active of {google.length} campaigns · {detail.keywords.length} keywords · {detail.searchTerms.length} search terms in this window
            {!detail.hasDetail ? " · keyword and search-term detail arrives with the next scan" : ""}
          </CardDescription>
        </div>
        <Link href={`/campaigns?window=${windowKey}`}>
          <Button size="xs" variant="ghost">
            All campaigns →
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Kpi label="Spend" value={acct.spend} previous={prev.spend} format="currency" invert />
          <Kpi label="Impressions" value={acct.impressions} previous={prev.impressions} format="compact" />
          <Kpi label="Clicks" value={acct.clicks} previous={prev.clicks} format="number" />
          <Kpi label="CTR" value={detail.derived.ctr} previous={detail.previousDerived.ctr} format="pct" />
          <Kpi label="Avg. CPC" value={detail.derived.cpc} previous={detail.previousDerived.cpc} format="currency2" invert />
          <Kpi label="Conversions" value={acct.conversions} previous={prev.conversions} format="number" hint="primary conversions" />
          <Kpi label="Cost / conv." value={detail.derived.cpa} previous={detail.previousDerived.cpa} format="currency" invert />
          <Kpi label="Conv. rate" value={detail.derived.conversionRate} previous={detail.previousDerived.conversionRate} format="pct" />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Block title="Campaigns" description="Every Google Ads campaign with prior period, health and fatigue.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">Cost / conv.</TableHead>
                  <TableHead className="text-right">SQLs</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {google
                  .sort((a, b) => Number(b.campaign.status === "active") - Number(a.campaign.status === "active") || b.totals.spend - a.totals.spend)
                  .slice(0, 10)
                  .map((r) => {
                    const p = deriveMetrics(r.previous);
                    return (
                      <TableRow key={r.campaign.id}>
                        <TableCell className="max-w-[16rem]">
                          <Link href={`/campaigns/${r.campaign.id}`} className="block truncate text-sm font-medium hover:underline">
                            {r.campaign.name}
                          </Link>
                          <span className="text-[11px] text-muted-2">
                            {r.campaign.channelType} · {fmtCurrency(r.campaign.dailyBudget)}/day
                            {r.campaign.status !== "active" ? ` · ${r.campaign.status}` : ""}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Compare value={r.totals.spend} previous={r.previous.spend} format="currency" invert hidePrevious />
                        </TableCell>
                        <TableCell>
                          <Compare value={r.totals.clicks} previous={r.previous.clicks} format="number" hidePrevious />
                        </TableCell>
                        <TableCell>
                          <Compare value={r.metrics.ctr} previous={p.ctr} format="pct" hidePrevious />
                        </TableCell>
                        <TableCell>
                          <Compare value={r.totals.leads} previous={r.previous.leads} format="number" hidePrevious />
                        </TableCell>
                        <TableCell>
                          <Compare value={r.metrics.cpl} previous={p.cpl} format="currency" invert hidePrevious />
                        </TableCell>
                        <TableCell>
                          <Compare value={r.totals.sqls} previous={r.previous.sqls} format="number" hidePrevious />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <HealthPill score={r.health.score} status={r.health.status} label={r.health.label} />
                            {r.fatigue.status !== "healthy" ? <FatiguePill status={r.fatigue.status} /> : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {google.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-xs text-muted">
                      No Google Ads campaigns yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Block>

          <Block title="Ad groups" description="Keyword-level spend rolled up per ad group.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad group</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">Cost / conv.</TableHead>
                  <TableHead className="text-right">Keywords</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.adGroups.slice(0, 10).map((g) => (
                  <TableRow key={g.key}>
                    <TableCell className="max-w-[14rem]">
                      <span className="block truncate text-sm font-medium">{g.adGroupName}</span>
                      <span className="block truncate text-[11px] text-muted-2">
                        {g.status !== "active" ? `${g.status} · ` : ""}
                        {campaignName(campaigns, g.campaignId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Compare value={g.current.spend} previous={g.previous.spend} format="currency" invert hidePrevious />
                    </TableCell>
                    <TableCell>
                      <Compare value={g.current.clicks} previous={g.previous.clicks} format="number" hidePrevious />
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">{fmtPct(g.derived.ctr)}</TableCell>
                    <TableCell className="tnum text-right text-sm">{fmtNumber(g.current.conversions)}</TableCell>
                    <TableCell className="tnum text-right text-sm">{fmtCurrency(g.derived.cpa)}</TableCell>
                    <TableCell className="tnum text-right text-sm">{g.keywords}</TableCell>
                  </TableRow>
                ))}
                {detail.adGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-xs text-muted">
                      No keyword detail stored yet — run a scan.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Block>
        </div>

        <Block title="Keywords" description="Top keywords by spend with quality score, impression share and prior period.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Match</TableHead>
                <TableHead className="text-right">QS</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">Cost / conv.</TableHead>
                <TableHead className="text-right">Impr. share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.keywords.slice(0, 12).map((k) => (
                <TableRow key={k.key}>
                  <TableCell className="max-w-[14rem]">
                    <span className="block truncate text-sm font-medium">{k.keywordText}</span>
                    <span className="block truncate text-[11px] text-muted-2">
                      {k.adGroupName}
                      {k.status !== "active" ? ` · ${k.status}` : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    <MatchBadge type={k.matchType} />
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">
                    {k.qualityScore !== undefined ? (
                      <span className={k.qualityScore <= 3 ? "text-negative" : k.qualityScore >= 7 ? "text-positive" : undefined}>{k.qualityScore}</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Compare value={k.current.spend} previous={k.previous.spend} format="currency" invert hidePrevious />
                  </TableCell>
                  <TableCell>
                    <Compare value={k.current.clicks} previous={k.previous.clicks} format="number" hidePrevious />
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">{fmtPct(k.derived.ctr)}</TableCell>
                  <TableCell>
                    <Compare value={k.current.conversions} previous={k.previous.conversions} format="number" hidePrevious />
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">{fmtCurrency(k.derived.cpa)}</TableCell>
                  <TableCell className="tnum text-right text-sm">{k.searchImpressionShare === null ? "—" : fmtPct(k.searchImpressionShare, 0)}</TableCell>
                </TableRow>
              ))}
              {detail.keywords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-xs text-muted">
                    No keyword rows in this window.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Block>

        <div className="grid gap-4 xl:grid-cols-2">
          <Block title="Match types" description="Where the money goes by match type.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead className="text-right">Cost / conv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.matchTypes.map((m) => (
                  <TableRow key={m.matchType}>
                    <TableCell>
                      <MatchBadge type={m.matchType} /> <span className="text-[11px] text-muted-2">{m.keywords} kw</span>
                    </TableCell>
                    <TableCell>
                      <Compare value={m.current.spend} previous={m.previous.spend} format="currency" invert hidePrevious />
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">{fmtPct(m.derived.ctr)}</TableCell>
                    <TableCell className="tnum text-right text-sm">{fmtNumber(m.current.conversions)}</TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {fmtCurrency(m.derived.cpa)} <Delta value={pctChange(m.derived.cpa ?? 0, m.previousDerived.cpa ?? 0)} invert />
                    </TableCell>
                  </TableRow>
                ))}
                {detail.matchTypes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-xs text-muted">
                      —
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Block>

          <Block title="Search terms" description="What people actually typed. Status shows whether the term is already a keyword or a negative.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Search term</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Conv.</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.searchTerms.slice(0, 8).map((t) => (
                  <TableRow key={t.key}>
                    <TableCell className="max-w-[14rem]">
                      <span className="block truncate text-sm font-medium">{t.searchTerm}</span>
                      <span className="block truncate text-[11px] text-muted-2">
                        via “{t.keywordText}” · {t.matchType.toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">{fmtMetric(t.current.spend, "currency")}</TableCell>
                    <TableCell className="tnum text-right text-sm">{fmtNumber(t.current.clicks)}</TableCell>
                    <TableCell className="tnum text-right text-sm">{fmtNumber(t.current.conversions)}</TableCell>
                    <TableCell>
                      <TermStatus status={t.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {detail.searchTerms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-xs text-muted">
                      No search-term rows in this window.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Block>
        </div>
      </CardContent>
    </Card>
  );
}

export function GoogleAdsAlerts({ signals }: { signals: ChannelDetail["signals"] }) {
  const own = signals.filter((s) => s.area === "google_ads");
  return (
    <Block title="Google Ads alerts" description="Rule-based: wasted spend, CPA outliers, low Quality Score, low CTR, negatives to add, keywords to add.">
      <div className="px-4 pb-4">
        <SignalList items={own.slice(0, 8)} empty="No keyword or search-term alerts in this window." />
      </div>
    </Block>
  );
}

function Block({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-md border border-border ${className ?? ""}`}>
      <div className="px-4 pt-3 pb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
        {description ? <p className="text-[11px] text-muted-2">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function MatchBadge({ type }: { type: string }) {
  const v = type === "EXACT" ? "accent" : type === "PHRASE" ? "info" : type === "BROAD" ? "warning" : "outline";
  return (
    <Badge variant={v} className="capitalize">
      {type.toLowerCase()}
    </Badge>
  );
}

function TermStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; v: "positive" | "negative" | "outline" | "default" }> = {
    ADDED: { label: "Keyword", v: "positive" },
    EXCLUDED: { label: "Negative", v: "negative" },
    ADDED_EXCLUDED: { label: "Both", v: "default" },
    NONE: { label: "Not added", v: "outline" },
    UNKNOWN: { label: "—", v: "outline" },
  };
  const m = map[status] ?? map.UNKNOWN;
  return <Badge variant={m.v}>{m.label}</Badge>;
}

function campaignName(rows: CampaignRow[], id: string) {
  return rows.find((r) => r.campaign.id === id)?.campaign.name ?? "";
}

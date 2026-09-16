import Link from "next/link";
import type { CampaignRow } from "@/lib/analytics/snapshot";
import type { IntegrationStatus, Platform } from "@/types/domain";
import { deriveMetrics } from "@/lib/calculations/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { HealthPill, FatiguePill } from "@/components/dashboard/status";
import { fmtCurrency } from "@/lib/utils/format";
import { Compare, Kpi, NotConnected } from "./metric-cell";
import { sumTotals } from "@/lib/calculations/metrics";

/**
 * Section 3: Meta Ads (and LinkedIn Ads, same shape). Shows the honest
 * "not connected" state until the platform is connected; campaigns known only
 * from HubSpot attribution appear without cost columns.
 */
export function PaidSocialSection({ platform, title, campaigns, integration, windowKey }: { platform: Platform; title: string; campaigns: CampaignRow[]; integration?: IntegrationStatus; windowKey: string }) {
  const rows = campaigns.filter((r) => r.campaign.platform === platform);
  const withSpend = rows.filter((r) => r.totals.spend > 0 || r.campaign.dailyBudget > 0);
  const connected = integration?.health === "connected" || integration?.health === "demo" || withSpend.length > 0;
  const id = `${platform}-ads`;
  if (!connected) {
    return (
      <Card id={id}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Not connected</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <NotConnected
            title={`${title} is not connected yet`}
            description={
              platform === "meta"
                ? "Once Meta access is granted, connect it in NotFair (or set the Marketing API credentials) and this section fills with campaign → ad set → ad performance, frequency and creative fatigue. Nothing is estimated in the meantime."
                : "Connect LinkedIn Ads in NotFair to get spend, impressions and clicks. Campaigns HubSpot attributes leads to are listed below without cost data."
            }
            action={
              <Link href="/integrations">
                <Button size="sm" variant="secondary">
                  Open Integrations
                </Button>
              </Link>
            }
          />
          {rows.length ? <PlaceholderTable rows={rows} /> : null}
        </CardContent>
      </Card>
    );
  }
  const totals = sumTotals(withSpend.map((r) => r.totals));
  const prev = sumTotals(withSpend.map((r) => r.previous));
  const d = deriveMetrics(totals);
  const p = deriveMetrics(prev);
  return (
    <Card id={id}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {withSpend.filter((r) => r.campaign.status === "active").length} active campaigns · {integration?.detail ?? ""}
          </CardDescription>
        </div>
        <Link href={`/campaigns?window=${windowKey}`}>
          <Button size="xs" variant="ghost">
            All campaigns →
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <Kpi label="Spend" value={totals.spend} previous={prev.spend} format="currency" invert />
          <Kpi label="Impressions" value={totals.impressions} previous={prev.impressions} format="compact" />
          <Kpi label="Clicks" value={totals.clicks} previous={prev.clicks} format="number" />
          <Kpi label="CTR" value={d.ctr} previous={p.ctr} format="pct" />
          <Kpi label="Frequency" value={totals.frequency ?? null} previous={prev.frequency ?? null} format="position" invert />
          <Kpi label="Leads" value={totals.leads} previous={prev.leads} format="number" />
          <Kpi label="Cost / lead" value={d.cpl} previous={p.cpl} format="currency" invert />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Impr.</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">Freq.</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">SQLs</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .sort((a, b) => b.totals.spend - a.totals.spend)
              .slice(0, 8)
              .map((r) => (
                <TableRow key={r.campaign.id}>
                  <TableCell className="max-w-[18rem]">
                    <Link href={`/campaigns/${r.campaign.id}`} className="block truncate text-sm font-medium hover:underline">
                      {r.campaign.name}
                    </Link>
                    <span className="text-[11px] text-muted-2">
                      {r.campaign.channelType} · {r.campaign.dailyBudget > 0 ? `${fmtCurrency(r.campaign.dailyBudget)}/day` : "no spend data"}
                    </span>
                  </TableCell>
                  <TableCell>{r.totals.spend > 0 ? <Compare value={r.totals.spend} previous={r.previous.spend} format="currency" invert hidePrevious /> : <span className="block text-right text-xs text-muted-2">—</span>}</TableCell>
                  <TableCell>
                    <Compare value={r.totals.impressions} previous={r.previous.impressions} format="compact" hidePrevious />
                  </TableCell>
                  <TableCell className="tnum text-right text-sm">{r.metrics.ctr === null ? "—" : `${(r.metrics.ctr * 100).toFixed(2)}%`}</TableCell>
                  <TableCell className="tnum text-right text-sm">{r.totals.frequency ? r.totals.frequency.toFixed(1) : "—"}</TableCell>
                  <TableCell>
                    <Compare value={r.totals.leads} previous={r.previous.leads} format="number" hidePrevious />
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
              ))}
          </TableBody>
        </Table>
        <p className="text-[11px] text-muted-2">Ad set → ad breakdown is available per campaign on its detail page; creative fatigue is scored on the Creatives page.</p>
      </CardContent>
    </Card>
  );
}

function PlaceholderTable({ rows }: { rows: CampaignRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Campaign (via HubSpot)</TableHead>
          <TableHead className="text-right">Leads</TableHead>
          <TableHead className="text-right">MQLs</TableHead>
          <TableHead className="text-right">SQLs</TableHead>
          <TableHead className="text-right">Pipeline</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 6).map((r) => (
          <TableRow key={r.campaign.id}>
            <TableCell className="max-w-[18rem]">
              <Link href={`/campaigns/${r.campaign.id}`} className="block truncate text-sm font-medium hover:underline">
                {r.campaign.name}
              </Link>
              <span className="text-[11px] text-muted-2">{r.campaign.channelType}</span>
            </TableCell>
            <TableCell>
              <Compare value={r.totals.leads} previous={r.previous.leads} format="number" hidePrevious />
            </TableCell>
            <TableCell>
              <Compare value={r.totals.mqls} previous={r.previous.mqls} format="number" hidePrevious />
            </TableCell>
            <TableCell>
              <Compare value={r.totals.sqls} previous={r.previous.sqls} format="number" hidePrevious />
            </TableCell>
            <TableCell>
              <Compare value={r.totals.pipeline} previous={r.previous.pipeline} format="compactCurrency" hidePrevious />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

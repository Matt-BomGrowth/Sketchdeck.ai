import Link from "next/link";
import type { ChannelRow, CrmOverview } from "@/lib/analytics/channel-detail";
import type { FunnelStageSummary, IntegrationStatus, MetricTotals } from "@/types/domain";
import { safeDivide, deriveMetrics, pctChange } from "@/lib/calculations/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FunnelView } from "@/components/pipeline/funnel";
import { fmtCompactCurrency, fmtMultiple, fmtPct } from "@/lib/utils/format";
import { Compare, Kpi, NotConnected } from "./metric-cell";
import { Delta } from "@/components/dashboard/status";

/** Section 6: CRM funnel by original source (every lead, not only paid). */
export function CrmSection({ crm, integration }: { crm: CrmOverview; integration?: IntegrationStatus }) {
  if (!crm.available) {
    return (
      <Card id="crm">
        <CardHeader>
          <CardTitle>CRM funnel (HubSpot)</CardTitle>
          <CardDescription>{integration?.detail ?? "Not connected"}</CardDescription>
        </CardHeader>
        <CardContent>
          <NotConnected
            title={integration?.health === "connected" ? "HubSpot is connected — funnel by source arrives with the next scan" : "HubSpot is not connected"}
            description={integration?.health === "connected" ? "Lifecycle and deal events are grouped by original traffic source on each scan." : "Set the HubSpot Service Key in Vercel and run a scan."}
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
  const t = crm.totals.current;
  const p = crm.totals.previous;
  return (
    <Card id="crm">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>CRM funnel by source (HubSpot)</CardTitle>
          <CardDescription>Lifecycle stage entries and deals in this window, grouped by HubSpot&apos;s original traffic source — paid and non-paid alike.</CardDescription>
        </div>
        <Link href="/pipeline">
          <Button size="xs" variant="ghost">
            Pipeline →
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="New leads" value={t.lead} previous={p.lead} format="number" />
          <Kpi label="MQLs" value={t.mql} previous={p.mql} format="number" />
          <Kpi label="SQLs" value={t.sql} previous={p.sql} format="number" />
          <Kpi label="Opportunities" value={t.opportunity} previous={p.opportunity} format="number" />
          <Kpi label="Pipeline created" value={t.pipeline} previous={p.pipeline} format="compactCurrency" />
          <Kpi label="Closed won" value={t.revenue} previous={p.revenue} format="compactCurrency" hint={`${t.closed_won} deals`} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">MQLs</TableHead>
              <TableHead className="text-right">SQLs</TableHead>
              <TableHead className="text-right">Lead → SQL</TableHead>
              <TableHead className="text-right">Opps</TableHead>
              <TableHead className="text-right">Pipeline</TableHead>
              <TableHead className="text-right">Won</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {crm.bySource.slice(0, 10).map((r) => (
              <TableRow key={r.source}>
                <TableCell className="text-sm font-medium">{r.label}</TableCell>
                <TableCell>
                  <Compare value={r.current.lead} previous={r.previous.lead} format="number" hidePrevious />
                </TableCell>
                <TableCell>
                  <Compare value={r.current.mql} previous={r.previous.mql} format="number" hidePrevious />
                </TableCell>
                <TableCell>
                  <Compare value={r.current.sql} previous={r.previous.sql} format="number" hidePrevious />
                </TableCell>
                <TableCell className="tnum text-right text-sm">{fmtPct(safeDivide(r.current.sql, r.current.lead), 0)}</TableCell>
                <TableCell>
                  <Compare value={r.current.opportunity} previous={r.previous.opportunity} format="number" hidePrevious />
                </TableCell>
                <TableCell>
                  <Compare value={r.current.pipeline} previous={r.previous.pipeline} format="compactCurrency" hidePrevious />
                </TableCell>
                <TableCell className="tnum text-right text-sm">{r.current.closed_won}</TableCell>
                <TableCell>
                  <Compare value={r.current.revenue} previous={r.previous.revenue} format="compactCurrency" hidePrevious />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Section 7: the unified funnel — ad spend → … → revenue overall, with lead → SQL quality per channel. */
export function UnifiedFunnelSection({ stages, channels, windowLabel }: { stages: FunnelStageSummary[]; channels: ChannelRow[]; windowLabel: string }) {
  const rows = channels.filter((c) => c.connected && (c.current.leads > 0 || c.previous.leads > 0 || c.current.spend > 0));
  return (
    <Card id="attribution">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Unified funnel</CardTitle>
          <CardDescription>Impressions → Clicks → Leads → MQLs → SQLs → Opportunities → Pipeline → Revenue across every channel, {windowLabel}.</CardDescription>
        </div>
        <Link href="/pipeline">
          <Button size="xs" variant="ghost">
            Full funnel →
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <FunnelView stages={stages} compact />
        </div>
        <div className="min-w-0 xl:col-span-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Lead quality by channel</h4>
          <p className="mb-2 text-[11px] text-muted-2">Share of leads that become SQLs, and pipeline per SQL. Paid channels also show pipeline ROAS.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Lead → SQL</TableHead>
                <TableHead className="text-right">Pipeline / SQL</TableHead>
                <TableHead className="text-right">Pipeline ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const d = deriveMetrics(c.current as MetricTotals);
                const pd = deriveMetrics(c.previous as MetricTotals);
                return (
                  <TableRow key={c.key}>
                    <TableCell className="text-sm font-medium">{c.label}</TableCell>
                    <TableCell className="tnum text-right text-sm">{c.current.leads}</TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {fmtPct(d.leadToSqlRate, 0)} <Delta value={pctChange(d.leadToSqlRate ?? 0, pd.leadToSqlRate ?? 0)} />
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">{fmtCompactCurrency(safeDivide(c.current.pipeline, c.current.sqls))}</TableCell>
                    <TableCell className="tnum text-right text-sm">{c.kind === "paid" ? fmtMultiple(d.pipelineRoas) : "—"}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-xs text-muted">
                    No channel has leads in this window yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

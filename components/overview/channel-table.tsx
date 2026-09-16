import Link from "next/link";
import type { ChannelRow } from "@/lib/analytics/channel-detail";
import { deriveMetrics } from "@/lib/calculations/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Compare } from "./metric-cell";
import { cn } from "@/lib/utils/cn";

const SECTION_HREF: Partial<Record<ChannelRow["key"], string>> = { google_ads: "/campaigns?platform=google", meta_ads: "/integrations", linkedin_ads: "/integrations", organic_search: "/pipeline" };

/**
 * Section 1 of the redesign: every channel side by side with the prior
 * period. Paid rows carry spend and platform leads; organic rows carry GA4
 * sessions/key events and CRM stages by original source. Cost columns show
 * "—" where there is no spend rather than a misleading $0.
 */
export function ChannelTable({ rows, windowLabel, previousLabel }: { rows: ChannelRow[]; windowLabel: string; previousLabel: string }) {
  const visible = rows.filter((r) => r.connected || r.kind === "paid");
  const total = visible.reduce(
    (acc, r) => {
      for (const k of ["spend", "clicks", "leads", "mqls", "sqls", "opportunities", "pipeline", "revenue"] as const) {
        acc.current[k] += r.current[k];
        acc.previous[k] += r.previous[k];
      }
      acc.current.sessions = sumNullable(acc.current.sessions, r.current.sessions);
      acc.previous.sessions = sumNullable(acc.previous.sessions, r.previous.sessions);
      return acc;
    },
    { current: { spend: 0, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0, sessions: null as number | null }, previous: { spend: 0, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0, sessions: null as number | null } },
  );
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Channel overview</CardTitle>
          <CardDescription>
            {windowLabel} vs. {previousLabel}. Paid rows come from the ad platforms, organic rows from GA4 sessions and the CRM by original source.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Clicks / Sessions</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">MQLs</TableHead>
              <TableHead className="text-right">SQLs</TableHead>
              <TableHead className="text-right">Cost / SQL</TableHead>
              <TableHead className="text-right">Pipeline</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => {
              const d = deriveMetrics(r.current);
              const p = deriveMetrics(r.previous);
              const paid = r.kind === "paid";
              const href = SECTION_HREF[r.key];
              return (
                <TableRow key={r.key} className={cn(!r.connected && "opacity-60")}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {href ? (
                          <Link href={href} className="hover:underline">
                            {r.label}
                          </Link>
                        ) : (
                          r.label
                        )}
                        {r.connected ? null : <Badge variant="outline">Not connected</Badge>}
                      </span>
                      <span className="text-[11px] text-muted-2">{paid ? "Paid · leads = platform conversions" : "Organic · leads from CRM source"}</span>
                    </div>
                  </TableCell>
                  <TableCell>{paid ? <Compare value={r.current.spend} previous={r.previous.spend} format="currency" invert /> : <Muted />}</TableCell>
                  <TableCell>
                    {paid ? (
                      <Compare value={r.current.clicks} previous={r.previous.clicks} format="number" />
                    ) : r.current.sessions !== null ? (
                      <Compare value={r.current.sessions} previous={r.previous.sessions} format="number" />
                    ) : (
                      <Muted label="no GA4" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Compare value={r.current.leads} previous={r.previous.leads} format="number" />
                  </TableCell>
                  <TableCell>
                    <Compare value={r.current.mqls} previous={r.previous.mqls} format="number" />
                  </TableCell>
                  <TableCell>
                    <Compare value={r.current.sqls} previous={r.previous.sqls} format="number" />
                  </TableCell>
                  <TableCell>{paid ? <Compare value={d.costPerSql} previous={p.costPerSql} format="currency" invert /> : <Muted />}</TableCell>
                  <TableCell>
                    <Compare value={r.current.pipeline} previous={r.previous.pipeline} format="compactCurrency" />
                  </TableCell>
                  <TableCell>
                    <Compare value={r.current.revenue} previous={r.previous.revenue} format="compactCurrency" />
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-surface-2/40 font-medium">
              <TableCell>Total</TableCell>
              <TableCell>
                <Compare value={total.current.spend} previous={total.previous.spend} format="currency" invert hidePrevious />
              </TableCell>
              <TableCell>
                <Compare value={total.current.clicks} previous={total.previous.clicks} format="number" hidePrevious />
              </TableCell>
              <TableCell>
                <Compare value={total.current.leads} previous={total.previous.leads} format="number" hidePrevious />
              </TableCell>
              <TableCell>
                <Compare value={total.current.mqls} previous={total.previous.mqls} format="number" hidePrevious />
              </TableCell>
              <TableCell>
                <Compare value={total.current.sqls} previous={total.previous.sqls} format="number" hidePrevious />
              </TableCell>
              <TableCell>
                <Muted />
              </TableCell>
              <TableCell>
                <Compare value={total.current.pipeline} previous={total.previous.pipeline} format="compactCurrency" hidePrevious />
              </TableCell>
              <TableCell>
                <Compare value={total.current.revenue} previous={total.previous.revenue} format="compactCurrency" hidePrevious />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function sumNullable(a: number | null, b: number | null) {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function Muted({ label = "—" }: { label?: string }) {
  return <div className="text-right text-xs text-muted-2">{label}</div>;
}

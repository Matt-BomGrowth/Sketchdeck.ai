import type { LeadQualityReport } from "@/agent/analyzers/lead-quality";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlatformBadge } from "@/components/dashboard/status";
import { fmtCompactCurrency, fmtCurrency, fmtMultiple, fmtPct } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export function LeadQualityPanel({ report }: { report: LeadQualityReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead Quality Intelligence</CardTitle>
        <CardDescription>Cheapest lead ≠ cheapest pipeline. Channels compared on qualification, not volume.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Channel</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">CPL</TableHead>
              <TableHead className="text-right">MQL rate</TableHead>
              <TableHead className="text-right">SQL rate</TableHead>
              <TableHead className="text-right">Lead → SQL</TableHead>
              <TableHead className="text-right">Cost / SQL</TableHead>
              <TableHead className="text-right">Pipeline</TableHead>
              <TableHead className="text-right">Pipeline ROAS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.channels.map((c) => (
              <TableRow key={c.platform}>
                <TableCell><PlatformBadge platform={c.platform} /></TableCell>
                <TableCell className="tnum text-right">{fmtCompactCurrency(c.totals.spend)}</TableCell>
                <TableCell className="tnum text-right">{c.totals.leads}</TableCell>
                <TableCell className={cn("tnum text-right", report.cheapestLeadChannel === c.platform && "font-semibold")}>{fmtCurrency(c.metrics.cpl)}</TableCell>
                <TableCell className="tnum text-right">{fmtPct(c.metrics.mqlRate, 0)}</TableCell>
                <TableCell className="tnum text-right">{fmtPct(c.metrics.sqlRate, 0)}</TableCell>
                <TableCell className="tnum text-right">{fmtPct(c.metrics.leadToSqlRate)}</TableCell>
                <TableCell className={cn("tnum text-right", report.bestSqlChannel === c.platform && "font-semibold text-positive")}>{fmtCurrency(c.metrics.costPerSql)}</TableCell>
                <TableCell className="tnum text-right">{fmtCompactCurrency(c.totals.pipeline)}</TableCell>
                <TableCell className="tnum text-right font-semibold">{fmtMultiple(c.metrics.pipelineRoas)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="rounded-md border border-accent/30 bg-accent-soft/40 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-accent">AI insight</p>
          <ul className="flex flex-col gap-1 text-sm">
            {report.insights.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
            {report.insights.length === 0 ? <li className="text-muted">Not enough qualified volume to compare channels yet.</li> : null}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

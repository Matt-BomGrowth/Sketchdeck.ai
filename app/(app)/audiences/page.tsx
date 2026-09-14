import { getPageSnapshot, windowDaysFrom } from "@/lib/analytics/page-snapshot";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DIMENSION_LABEL } from "@/agent/analyzers/icp";
import type { AudienceDimension } from "@/types/domain";
import { fmtCompactCurrency, fmtCurrency, fmtMultiple, fmtPct } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audiences" };

const DIMS = Object.keys(DIMENSION_LABEL) as AudienceDimension[];

export default async function AudiencesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { days, key } = windowDaysFrom((await searchParams).window);
  const s = await getPageSnapshot(days);
  const icp = s.icp;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Who actually converts?" subtitle="ICP intelligence: pipeline concentration by industry, company size, title, seniority and geography (trailing 90 days of CRM attribution)." windowKey={key} />
      <Card className="border-accent/30 bg-accent-soft/30">
        <CardHeader>
          <CardTitle>AI insights</CardTitle>
          <CardDescription>Spend share vs. pipeline share reveals where campaigns over- and under-index.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <ul className="flex flex-col gap-2 text-sm">
            {icp.insights.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
            {icp.insights.length === 0 ? <li className="text-muted">Segments are balanced relative to spend.</li> : null}
          </ul>
          <ul className="flex flex-col gap-2 text-sm">
            {icp.recommendations.map((r, k) => (
              <li key={k} className="rounded-md border border-border bg-surface px-3 py-2">
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-accent">Recommendation</span>
                {r}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Tabs defaultValue="seniority">
        <TabsList>
          {DIMS.map((d) => (
            <TabsTrigger key={d} value={d}>{DIMENSION_LABEL[d]}</TabsTrigger>
          ))}
        </TabsList>
        {DIMS.map((d) => (
          <TabsContent key={d} value={d}>
            <Card>
              <CardContent className="px-2 pt-2 pb-2">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{DIMENSION_LABEL[d]}</TableHead>
                      <TableHead className="text-right">Spend</TableHead>
                      <TableHead className="text-right">Spend share</TableHead>
                      <TableHead className="text-right">MQLs</TableHead>
                      <TableHead className="text-right">SQLs</TableHead>
                      <TableHead className="text-right">Opps</TableHead>
                      <TableHead className="text-right">Pipeline</TableHead>
                      <TableHead className="text-right">Pipeline share</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Cost / SQL</TableHead>
                      <TableHead className="text-right">Pipeline ROAS</TableHead>
                      <TableHead className="text-right">Index</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {icp.byDimension[d].map((r) => (
                      <TableRow key={r.value}>
                        <TableCell className="font-medium">{r.value}</TableCell>
                        <TableCell className="tnum text-right">{fmtCompactCurrency(r.spend)}</TableCell>
                        <TableCell className="tnum text-right">{fmtPct(r.spendShare, 0)}</TableCell>
                        <TableCell className="tnum text-right">{r.mqls}</TableCell>
                        <TableCell className="tnum text-right">{r.sqls}</TableCell>
                        <TableCell className="tnum text-right">{r.opportunities}</TableCell>
                        <TableCell className="tnum text-right font-medium">{fmtCompactCurrency(r.pipeline)}</TableCell>
                        <TableCell className="tnum text-right">{fmtPct(r.pipelineShare, 0)}</TableCell>
                        <TableCell className="tnum text-right">{fmtCompactCurrency(r.revenue)}</TableCell>
                        <TableCell className="tnum text-right">{fmtCurrency(r.costPerSql)}</TableCell>
                        <TableCell className="tnum text-right font-semibold">{fmtMultiple(r.pipelineRoas)}</TableCell>
                        <TableCell className={cn("tnum text-right font-medium", (r.index ?? 1) >= 1.3 ? "text-positive" : (r.index ?? 1) <= 0.7 ? "text-negative" : "")}>{r.index === null ? "—" : `${r.index.toFixed(2)}×`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="px-3 pt-2 text-[11px] text-muted">Index = pipeline share ÷ spend share. Above 1.3× means the segment is under-invested relative to results; below 0.7× means over-invested.</p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

import { getPageSnapshot, windowDaysFrom } from "@/lib/analytics/page-snapshot";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreativeCard } from "@/components/creatives/creative-card";
import { PlatformBadge } from "@/components/dashboard/status";
import { Badge } from "@/components/ui/badge";
import { getDataMode } from "@/lib/config/data-mode";
import { fmtCompactCurrency, fmtMultiple, fmtPct } from "@/lib/utils/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creatives" };

export default async function CreativesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { days, key } = windowDaysFrom((await searchParams).window);
  const s = await getPageSnapshot(days);
  const c = s.creatives;
  const byPipeline = [...c.items].filter((i) => i.totals.spend > 0).sort((a, b) => (b.metrics.pipelineRoas ?? 0) - (a.metrics.pipelineRoas ?? 0));
  const mode = getDataMode();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Creative Intelligence" subtitle="Creatives ranked by pipeline per dollar — never by CTR alone." windowKey={key} />
      {mode === "demo" ? (
        <p className="rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs">
          Demo mode: creative copy reflects SketchDeck&apos;s real messaging, but no media assets are shown. In live mode AdPilot displays real image assets from Google Ads (via NotFair) and platform previews where permitted; if none is accessible it says <em>Creative unavailable</em>.
        </p>
      ) : null}
      <Card className="border-accent/30 bg-accent-soft/30">
        <CardHeader>
          <CardTitle>AI insights</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5 text-sm">
            {c.insights.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
            {c.insights.length === 0 ? <li className="text-muted">No creative stands out yet.</li> : null}
          </ul>
        </CardContent>
      </Card>
      <Tabs defaultValue="top">
        <TabsList>
          <TabsTrigger value="top">Top ({c.top.length})</TabsTrigger>
          <TabsTrigger value="under">Underperforming ({c.underperforming.length})</TabsTrigger>
          <TabsTrigger value="fatiguing">Fatiguing ({c.fatiguing.length})</TabsTrigger>
          <TabsTrigger value="ab">A/B tests ({c.abTests.length})</TabsTrigger>
          <TabsTrigger value="pipeline">Creative → Pipeline</TabsTrigger>
        </TabsList>
        <TabsContent value="top"><Grid items={c.top} /></TabsContent>
        <TabsContent value="under"><Grid items={c.underperforming} /></TabsContent>
        <TabsContent value="fatiguing"><Grid items={c.fatiguing} /></TabsContent>
        <TabsContent value="ab">
          <div className="flex flex-col gap-4">
            {c.abTests.map((t) => (
              <Card key={t.testGroup}>
                <CardHeader>
                  <CardTitle>{t.testGroup}</CardTitle>
                  <CardDescription>
                    Leader by pipeline ROAS: <span className="font-medium text-foreground">{t.leader?.creative.name}</span> ({fmtMultiple(t.leader?.metrics.pipelineRoas)}).{" "}
                    {t.variants.reduce((a, v) => a + v.totals.sqls, 0) < 10 ? "Low SQL volume — treat as directional." : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {t.variants.map((v) => (
                    <CreativeCard key={v.creative.id} item={v} />
                  ))}
                </CardContent>
              </Card>
            ))}
            {c.abTests.length === 0 ? <p className="text-xs text-muted">No A/B test groups detected.</p> : null}
          </div>
        </TabsContent>
        <TabsContent value="pipeline">
          <Card>
            <CardContent className="px-2 pt-2 pb-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Creative</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">MQL</TableHead>
                    <TableHead className="text-right">SQL</TableHead>
                    <TableHead className="text-right">Pipeline</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Pipeline ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byPipeline.map((i, k) => (
                    <TableRow key={i.creative.id}>
                      <TableCell className="max-w-[24rem]">
                        <div className="flex items-center gap-2">
                          <span className="tnum w-5 text-xs text-muted-2">{k + 1}</span>
                          <PlatformBadge platform={i.creative.platform} short />
                          <span className="truncate font-medium" title={i.creative.name}>{i.creative.name}</span>
                          {i.category !== "other" ? <Badge variant="outline" className="capitalize">{i.category.replace("_", " ")}</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="tnum text-right">{fmtCompactCurrency(i.totals.spend)}</TableCell>
                      <TableCell className="tnum text-right">{fmtPct(i.metrics.ctr, 2)}</TableCell>
                      <TableCell className="tnum text-right">{i.totals.leads}</TableCell>
                      <TableCell className="tnum text-right">{i.totals.mqls}</TableCell>
                      <TableCell className="tnum text-right">{i.totals.sqls}</TableCell>
                      <TableCell className="tnum text-right font-medium">{fmtCompactCurrency(i.totals.pipeline)}</TableCell>
                      <TableCell className="tnum text-right">{fmtCompactCurrency(i.totals.revenue)}</TableCell>
                      <TableCell className="tnum text-right font-semibold">{fmtMultiple(i.metrics.pipelineRoas)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Grid({ items }: { items: Parameters<typeof CreativeCard>[0]["item"][] }) {
  if (items.length === 0) return <p className="text-xs text-muted">Nothing in this category.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((i, k) => (
        <CreativeCard key={i.creative.id} item={i} rank={k + 1} />
      ))}
    </div>
  );
}

import Link from "next/link";
import { getPageSnapshot, windowDaysFrom } from "@/lib/analytics/page-snapshot";
import { getRepository } from "@/lib/data";
import { buildInsightModules } from "@/agent/analyzers/insights";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { days, key } = windowDaysFrom((await searchParams).window);
  const [s, repo] = await Promise.all([getPageSnapshot(days), getRepository()]);
  const modules = buildInsightModules(s, await repo.getIntegrationStatuses());
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Insights" subtitle="Secondary intelligence. Measured where a data source is connected; labeled illustrative otherwise." windowKey={key} right={<Link href="/insights/stack"><Button size="sm" variant="secondary">Marketing stack consolidation →</Button></Link>} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <Card key={m.key} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>{m.title}</CardTitle>
                <Badge variant={m.status === "measured" ? "positive" : m.status === "illustrative" ? "warning" : "outline"} className="capitalize">{m.status}</Badge>
              </div>
              <CardDescription>Source: {m.source}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="text-xs text-muted">{m.note}</p>
              <ul className="flex flex-col gap-2">
                {m.items.map((it, i) => (
                  <li key={i} className="rounded-md border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{it.title}</p>
                      {it.label ? <span className="rounded-sm border border-border px-1 py-px text-[10px] uppercase tracking-wide text-muted">{it.label}</span> : null}
                    </div>
                    <p className="text-xs text-muted">{it.detail}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}

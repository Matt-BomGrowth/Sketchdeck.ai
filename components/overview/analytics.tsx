import Link from "next/link";
import type { Ga4Overview, SearchConsoleOverview } from "@/lib/analytics/channel-detail";
import { engagementRate, keyEventRate } from "@/lib/analytics/channel-detail";
import type { IntegrationStatus } from "@/types/domain";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { fmtNumber, fmtPct } from "@/lib/utils/format";
import { Compare, Kpi, NotConnected } from "./metric-cell";
import { SignalList } from "./signals";
import type { Signal } from "@/lib/analytics/channel-detail";

/** Section 4: GA4 — users, sessions, engagement, key events, channels and landing pages. */
export function AnalyticsSection({ ga4, integration, signals }: { ga4: Ga4Overview; integration?: IntegrationStatus; signals: Signal[] }) {
  const own = signals.filter((s) => s.area === "analytics");
  if (!ga4.available) {
    return (
      <Card id="analytics">
        <CardHeader>
          <CardTitle>Analytics (GA4)</CardTitle>
          <CardDescription>{integration?.detail ?? "Not connected"}</CardDescription>
        </CardHeader>
        <CardContent>
          <NotConnected
            title={integration?.health === "connected" ? "GA4 is connected — daily detail arrives with the next scan" : "GA4 is not connected"}
            description={integration?.health === "connected" ? "Sessions, users, engagement, key events, channels and landing pages are stored by the scan. Trigger one from the Integrations page or wait for the daily run." : "GA4 is read through NotFair. Connect NotFair on the Integrations page."}
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
  const t = ga4.totals.current;
  const p = ga4.totals.previous;
  return (
    <Card id="analytics">
      <CardHeader>
        <CardTitle>Analytics (GA4)</CardTitle>
        <CardDescription>Site-wide behaviour by default channel group and landing page. Key events: {ga4.keyEvents.map((k) => k.event).slice(0, 4).join(", ") || "—"}.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Users" value={t.users} previous={p.users} format="number" />
          <Kpi label="New users" value={t.newUsers} previous={p.newUsers} format="number" />
          <Kpi label="Sessions" value={t.sessions} previous={p.sessions} format="number" />
          <Kpi label="Engagement rate" value={engagementRate(t)} previous={engagementRate(p)} format="pct" />
          <Kpi label="Key events" value={t.keyEvents} previous={p.keyEvents} format="number" />
          <Kpi label="Key event rate" value={keyEventRate(t)} previous={keyEventRate(p)} format="pct2" />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <MiniTable title="Channels" head={["Channel", "Sessions", "Eng.", "Key events"]}>
            {ga4.channels.slice(0, 8).map((c) => (
              <TableRow key={c.channel}>
                <TableCell className="text-sm font-medium">{c.channel}</TableCell>
                <TableCell>
                  <Compare value={c.current.sessions} previous={c.previous.sessions} format="number" hidePrevious />
                </TableCell>
                <TableCell className="tnum text-right text-sm">{fmtPct(engagementRate(c.current), 0)}</TableCell>
                <TableCell>
                  <Compare value={c.current.keyEvents} previous={c.previous.keyEvents} format="number" hidePrevious />
                </TableCell>
              </TableRow>
            ))}
          </MiniTable>
          <MiniTable title="Landing pages" head={["Page", "Sessions", "Eng.", "Key events"]}>
            {ga4.landingPages.slice(0, 8).map((c) => (
              <TableRow key={c.page}>
                <TableCell className="max-w-[14rem] truncate text-sm font-medium" title={c.page}>
                  {c.page}
                </TableCell>
                <TableCell>
                  <Compare value={c.current.sessions} previous={c.previous.sessions} format="number" hidePrevious />
                </TableCell>
                <TableCell className="tnum text-right text-sm">{fmtPct(engagementRate(c.current), 0)}</TableCell>
                <TableCell className="tnum text-right text-sm">{fmtNumber(c.current.keyEvents)}</TableCell>
              </TableRow>
            ))}
          </MiniTable>
          <div className="flex min-w-0 flex-col gap-4">
            <MiniTable title="Key events" head={["Event", "Count", "Top channel"]}>
              {ga4.keyEvents.slice(0, 6).map((k) => {
                const top = ga4.keyEventsByChannel.find((x) => x.event === k.event);
                return (
                  <TableRow key={k.event}>
                    <TableCell className="max-w-[12rem] truncate text-sm font-medium" title={k.event}>
                      {k.event}
                    </TableCell>
                    <TableCell>
                      <Compare value={k.current.count} previous={k.previous.count} format="number" hidePrevious />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted">{top ? `${top.channel} (${top.count})` : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </MiniTable>
            {own.length ? (
              <div className="rounded-md border border-border px-4 py-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Analytics signals</h4>
                <SignalList items={own.slice(0, 4)} empty="" />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Section 5: SEO — Search Console clicks, impressions, CTR, position, queries, pages and opportunities. */
export function SeoSection({ sc, integration, signals }: { sc: SearchConsoleOverview; integration?: IntegrationStatus; signals: Signal[] }) {
  const own = signals.filter((s) => s.area === "seo");
  if (!sc.available) {
    return (
      <Card id="seo">
        <CardHeader>
          <CardTitle>SEO (Search Console)</CardTitle>
          <CardDescription>{integration?.detail ?? "Not connected"}</CardDescription>
        </CardHeader>
        <CardContent>
          <NotConnected
            title={integration?.health === "connected" ? "Search Console is connected but has no impressions in this window" : "Search Console is not connected"}
            description={
              integration?.health === "connected"
                ? "The property https://www.sketchdeck.ai/ reports almost no organic impressions yet. If the site's traffic lives on a different property (for example the domain property sc-domain:sketchdeck.ai), select that one in NotFair → Search Console and run a scan."
                : "Search Console is read through NotFair. Connect it in NotFair, then run a scan."
            }
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
  const t = sc.site.current;
  const p = sc.site.previous;
  return (
    <Card id="seo">
      <CardHeader>
        <CardTitle>SEO (Search Console)</CardTitle>
        <CardDescription>Organic search performance for the site, top queries and pages, and where ranking effort pays back fastest.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="Organic clicks" value={t.clicks} previous={p.clicks} format="number" />
          <Kpi label="Impressions" value={t.impressions} previous={p.impressions} format="compact" />
          <Kpi label="CTR" value={t.ctr} previous={p.ctr} format="pct" />
          <Kpi label="Avg. position" value={t.position} previous={p.position} format="position" invert />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <MiniTable title="Top queries" head={["Query", "Clicks", "Impr.", "Pos."]}>
            {sc.queries.slice(0, 8).map((q) => (
              <TableRow key={q.query}>
                <TableCell className="max-w-[14rem] truncate text-sm font-medium" title={q.query}>
                  {q.query}
                </TableCell>
                <TableCell>
                  <Compare value={q.current.clicks} previous={q.previous.clicks} format="number" hidePrevious />
                </TableCell>
                <TableCell className="tnum text-right text-sm">{fmtNumber(q.current.impressions)}</TableCell>
                <TableCell>
                  <Compare value={q.current.position} previous={q.previous.position} format="position" invert hidePrevious />
                </TableCell>
              </TableRow>
            ))}
          </MiniTable>
          <MiniTable title="Top pages" head={["Page", "Clicks", "Impr.", "Pos."]}>
            {sc.pages.slice(0, 8).map((q) => (
              <TableRow key={q.page}>
                <TableCell className="max-w-[14rem] truncate text-sm font-medium" title={q.page}>
                  {q.page.replace(/^https?:\/\/[^/]+/, "") || "/"}
                </TableCell>
                <TableCell>
                  <Compare value={q.current.clicks} previous={q.previous.clicks} format="number" hidePrevious />
                </TableCell>
                <TableCell className="tnum text-right text-sm">{fmtNumber(q.current.impressions)}</TableCell>
                <TableCell>
                  <Compare value={q.current.position} previous={q.previous.position} format="position" invert hidePrevious />
                </TableCell>
              </TableRow>
            ))}
          </MiniTable>
          <div className="rounded-md border border-border px-4 py-3">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">SEO opportunities</h4>
            <p className="mb-2 text-[11px] text-muted-2">Striking-distance queries (positions 4–15 with demand), low-CTR top rankings, and drops.</p>
            <SignalList items={own.slice(0, 6)} empty="No SEO opportunities detected in this window." />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniTable({ title, head, children }: { title: string; head: string[]; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-border">
      <h4 className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      <Table>
        <TableHeader>
          <TableRow>
            {head.map((h, i) => (
              <TableHead key={h} className={i === 0 ? undefined : "text-right"}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

import Link from "next/link";
import type { PlatformWowRow, WeeklyReport } from "@/lib/reports/weekly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlatformBadge } from "@/components/dashboard/status";
import { fmtCurrency } from "@/lib/utils/format";
import { WowCell, WowDelta, metricDef } from "./wow";

/** Section 2: the blended numbers broken down by platform, each with WoW. */
export function PlatformSection({ report }: { report: WeeklyReport }) {
  const rows = report.platforms.filter((p) => p.connected || p.platform === "google" || p.platform === "meta");
  const delta = report.blended.current.spend - report.blended.previous.spend;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform breakdown</CardTitle>
        <CardDescription>
          Where the blended change came from.{" "}
          {delta !== 0
            ? `Blended spend moved ${fmtCurrency(Math.abs(delta))} ${delta > 0 ? "up" : "down"}; each platform's share of that move is shown.`
            : "Blended spend was unchanged."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 xl:grid-cols-2">
        {rows.map((p) => (
          <PlatformCard key={p.platform} p={p} />
        ))}
      </CardContent>
    </Card>
  );
}

/** "+$96 (↑ 1.2%) · 67% of the net increase" — the share is shown only when the platform moved the same way as the blended total. */
function SpendMove({ p }: { p: PlatformWowRow }) {
  const d = p.current.spend - p.previous.spend;
  if (d === 0) return <span className="ml-auto text-[11px] text-muted">spend unchanged</span>;
  const sameDirection = p.shareOfSpendDelta !== null && p.shareOfSpendDelta > 0;
  return (
    <span className="ml-auto text-[11px] text-muted">
      <span className="tnum font-medium text-foreground">
        {d > 0 ? "+" : "−"}
        {fmtCurrency(Math.abs(d))}
      </span>{" "}
      <WowDelta change={p.spendChange} direction="neutral" />
      {sameDirection ? ` · ${Math.round(Math.min(1.5, p.shareOfSpendDelta!) * 100)}% of the net ${d > 0 ? "increase" : "decrease"}` : " · against the blended trend"}
    </span>
  );
}

function PlatformCard({ p }: { p: PlatformWowRow }) {
  const social = p.platform !== "google";
  const metrics: Array<{ key: Parameters<typeof metricDef>[0]; value: number | null; previous: number | null }> = [
    { key: "spend", value: p.current.spend, previous: p.previous.spend },
    { key: "impressions", value: p.current.impressions, previous: p.previous.impressions },
    ...(social ? [{ key: "reach" as const, value: p.current.reach, previous: p.previous.reach }, { key: "frequency" as const, value: p.current.frequency, previous: p.previous.frequency }] : []),
    { key: "clicks", value: p.current.clicks, previous: p.previous.clicks },
    { key: "ctr", value: p.rates.ctr, previous: p.previousRates.ctr },
    { key: "cpc", value: p.rates.cpc, previous: p.previousRates.cpc },
    ...(social ? [{ key: "cpm" as const, value: p.rates.cpm, previous: p.previousRates.cpm }] : []),
    { key: "conversions", value: p.current.conversions, previous: p.previous.conversions },
    { key: "costPerConversion", value: p.rates.costPerConversion, previous: p.previousRates.costPerConversion },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <PlatformBadge platform={p.platform} />
        <span className="text-sm font-semibold">{p.label}</span>
        {!p.connected ? <Badge variant="outline">Not connected</Badge> : <span className="text-[11px] text-muted">{p.campaigns} campaigns with spend</span>}
        {p.connected ? <SpendMove p={p} /> : null}
      </div>
      {!p.connected ? (
        <div className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted">
          {p.platform === "meta" ? "Meta Ads is not connected yet. Once access is granted, connect it in NotFair and this card fills with spend, reach, frequency, CPM and conversions." : "Connect this platform in NotFair to include it."}{" "}
          <Link href="/integrations" className="text-accent hover:underline">
            Integrations →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m) => {
            const def = metricDef(m.key);
            return (
              <div key={m.key} className="flex flex-col">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-2">{def.label}</span>
                <WowCell value={m.value} previous={m.previous} format={def.format} direction={def.direction} align="left" />
              </div>
            );
          })}
        </div>
      )}
      {p.connected ? (
        <Link href={`/campaigns?platform=${p.platform}`} className="self-start">
          <Button size="xs" variant="ghost">
            {p.label} campaigns →
          </Button>
        </Link>
      ) : null}
    </div>
  );
}

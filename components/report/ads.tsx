import Link from "next/link";
import type { AdWowRow, WeeklyReport } from "@/lib/reports/weekly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/dashboard/status";
import { WowCell, WowDelta, fmtReportMetric } from "./wow";

/**
 * Section 4: the ads that were actually running and how they performed.
 * Shows the real asset when the platform supplied a URL, the RSA copy for
 * Search ads, and an explicit "asset not available" otherwise — never a
 * stand-in image.
 */
export function AdsSection({ report, limit = 12 }: { report: WeeklyReport; limit?: number }) {
  const rows = report.ads.filter((a) => a.current.impressions > 0 || a.current.spend > 0).slice(0, limit);
  const hasSocial = rows.some((a) => a.platform !== "google");
  const hasAssets = rows.some((a) => a.creative.assetStatus === "asset" || a.creative.assetStatus === "preview");
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Ad / creative performance</CardTitle>
          <CardDescription>
            Ads with impressions this period, by spend.{" "}
            {hasAssets ? "Images and videos are the platform's own assets." : "No image or video URLs were supplied by the platforms for these ads; Search ads show their live headlines, descriptions and final URL."}
          </CardDescription>
        </div>
        <Link href="/creatives" className="text-xs text-accent hover:underline">
          Creative fatigue &amp; pipeline view →
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ad</TableHead>
              <TableHead>Campaign · ad group</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Impr.</TableHead>
              {hasSocial ? <TableHead className="text-right">Reach · freq.</TableHead> : null}
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">Conv.</TableHead>
              <TableHead className="text-right">Cost / conv.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.creative.id}>
                <TableCell className="max-w-[22rem] whitespace-normal align-top">
                  <AdPreview a={a} />
                </TableCell>
                <TableCell className="max-w-[14rem] align-top">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <PlatformBadge platform={a.platform} short />
                      <Link href={`/campaigns/${a.campaignId}`} className="truncate text-xs font-medium hover:underline" title={a.campaignName}>
                        {a.campaignName}
                      </Link>
                    </div>
                    {a.creative.adGroupName ? <span className="truncate text-[11px] text-muted-2">{a.creative.adGroupName}</span> : null}
                    {a.creative.status !== "active" ? <Badge variant="outline">{a.creative.status}</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <WowCell value={a.current.spend} previous={a.previous.spend} format="currency" direction="neutral" />
                </TableCell>
                <TableCell className="tnum text-right align-top text-sm">{fmtReportMetric(a.current.impressions, "number")}</TableCell>
                {hasSocial ? (
                  <TableCell className="tnum text-right align-top text-sm">
                    {a.current.reach !== null ? `${fmtReportMetric(a.current.reach, "number")} · ${fmtReportMetric(a.current.frequency, "multiple")}` : <span className="text-muted-2">—</span>}
                  </TableCell>
                ) : null}
                <TableCell className="tnum text-right align-top text-sm">{fmtReportMetric(a.current.clicks, "number")}</TableCell>
                <TableCell className="align-top">
                  <div className="tnum flex flex-col items-end leading-tight">
                    <span className="text-sm">{fmtReportMetric(a.rates.ctr, "pct")}</span>
                    <WowDelta change={a.ctrChange} direction="higher_better" className="text-[11px]" />
                  </div>
                </TableCell>
                <TableCell className="tnum text-right align-top text-sm">{fmtReportMetric(a.rates.cpc, "currency2")}</TableCell>
                <TableCell className="align-top">
                  <WowCell value={a.current.conversions} previous={a.previous.conversions} format="number" direction="higher_better" />
                </TableCell>
                <TableCell className="align-top">
                  <WowCell value={a.rates.costPerConversion} previous={a.previousRates.costPerConversion} format="currency2" direction="lower_better" />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={hasSocial ? 10 : 9} className="text-xs text-muted">
                  No ad-level rows for this period yet. Ad-level metrics are stored by the scan; run one after connecting a platform.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
        {report.ads.length > limit ? <p className="px-5 py-3 text-[11px] text-muted">Showing the top {limit} of {report.ads.length} ads by spend.</p> : null}
      </CardContent>
    </Card>
  );
}

function AdPreview({ a }: { a: AdWowRow }) {
  const c = a.creative;
  const src = c.thumbnailUrl ?? c.assetUrl ?? c.previewUrl;
  const hasAsset = (c.assetStatus === "asset" || c.assetStatus === "preview") && src;
  const headlines = c.headlines?.length ? c.headlines : c.headline ? [c.headline] : [];
  const descriptions = c.descriptions?.length ? c.descriptions : [c.primaryText, c.description].filter((x): x is string => Boolean(x));
  const url = c.landingUrl?.replace(/^https?:\/\//, "");
  return (
    <div className="flex gap-3">
      {hasAsset ? (
        // eslint-disable-next-line @next/next/no-img-element -- platform asset URLs (googlesyndication, fbcdn)
        <img src={src} alt={c.headline || c.name} className="size-20 shrink-0 rounded-md object-cover" loading="lazy" />
      ) : c.type === "text" ? null : (
        <div className="flex size-20 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface-2 px-1 text-center text-[10px] text-muted">{c.assetStatus === "demo" ? "Demo · no asset" : `${c.type} asset not available via API`}</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-2">
          {c.type === "text" ? "Responsive search ad" : c.type} · {c.name}
        </p>
        <p className="line-clamp-2 text-sm font-medium text-info" title={headlines.join(" | ")}>
          {headlines.slice(0, 3).join(" | ") || c.name}
        </p>
        {headlines.length > 3 ? <p className="text-[11px] text-muted-2">+ {headlines.length - 3} more headlines</p> : null}
        {descriptions.length ? (
          <p className="line-clamp-2 text-xs text-muted" title={descriptions.join(" | ")}>
            {descriptions.slice(0, 2).join(" · ")}
          </p>
        ) : null}
        {url ? <p className="truncate text-[11px] text-positive">{url}</p> : null}
        {c.assetStatus === "preview" && c.previewUrl ? (
          <a href={c.previewUrl} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline">
            Open platform preview ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

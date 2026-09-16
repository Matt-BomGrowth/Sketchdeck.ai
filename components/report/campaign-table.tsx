"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CampaignWowRow, Platform } from "./types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "@/components/dashboard/status";
import { WowCell, WowDelta, fmtReportMetric } from "./wow";
import { cn } from "@/lib/utils/cn";

type SortKey = "spend" | "spendChange" | "conversions" | "conversionsChange" | "costPerConversion" | "costPerConversionChange" | "impressions" | "clicks" | "ctr" | "reach" | "frequency" | "cpc" | "cpm";

type Quick = "all" | "spend_up" | "spend_down" | "conv_up" | "conv_down" | "more_efficient" | "less_efficient" | "big_changes";

const QUICK: Array<{ key: Quick; label: string }> = [
  { key: "all", label: "All" },
  { key: "spend_up", label: "Spending more" },
  { key: "spend_down", label: "Spending less" },
  { key: "conv_up", label: "More conversions" },
  { key: "conv_down", label: "Fewer conversions" },
  { key: "more_efficient", label: "More efficient" },
  { key: "less_efficient", label: "Less efficient" },
  { key: "big_changes", label: "Significant changes" },
];

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "spend", label: "Spend" },
  { key: "conversions", label: "Conversions" },
  { key: "costPerConversion", label: "Cost / conv." },
  { key: "impressions", label: "Impressions" },
  { key: "clicks", label: "Clicks" },
  { key: "ctr", label: "CTR" },
  { key: "reach", label: "Reach" },
  { key: "frequency", label: "Freq." },
  { key: "cpc", label: "CPC" },
  { key: "cpm", label: "CPM" },
];

function val(r: CampaignWowRow, k: SortKey): number | null {
  switch (k) {
    case "spend":
      return r.current.spend;
    case "spendChange":
      return r.spendChange;
    case "conversions":
      return r.current.conversions;
    case "conversionsChange":
      return r.conversionsChange;
    case "costPerConversion":
      return r.rates.costPerConversion;
    case "costPerConversionChange":
      return r.costPerConversionChange;
    case "impressions":
      return r.current.impressions;
    case "clicks":
      return r.current.clicks;
    case "ctr":
      return r.rates.ctr;
    case "reach":
      return r.current.reach;
    case "frequency":
      return r.current.frequency;
    case "cpc":
      return r.rates.cpc;
    case "cpm":
      return r.rates.cpm;
  }
}

function matches(r: CampaignWowRow, q: Quick, minSpend: number): boolean {
  const abs = (v: number | null) => (v === null ? 0 : Math.abs(v));
  switch (q) {
    case "all":
      return true;
    case "spend_up":
      return (r.spendChange ?? 0) >= 0.1 || (r.previous.spend === 0 && r.current.spend >= minSpend);
    case "spend_down":
      return (r.spendChange ?? 0) <= -0.1 && r.previous.spend >= minSpend;
    case "conv_up":
      return r.current.conversions > r.previous.conversions;
    case "conv_down":
      return r.current.conversions < r.previous.conversions;
    case "more_efficient":
      return (r.costPerConversionChange ?? 0) <= -0.1 && r.current.conversions > 0;
    case "less_efficient":
      return (r.costPerConversionChange ?? 0) >= 0.1 || (r.previous.conversions > 0 && r.current.conversions === 0 && r.current.spend >= minSpend);
    case "big_changes":
      return (abs(r.spendChange) >= 0.25 && Math.max(r.current.spend, r.previous.spend) >= minSpend) || abs(r.conversionsChange) >= 0.3 || abs(r.costPerConversionChange) >= 0.3 || abs(r.ctrChange) >= 0.2;
  }
}

/** Section 3: every campaign with WoW changes, sortable, with one-click views for the questions a marketer asks first. */
export function CampaignWowTable({ rows, platforms, blendedSpend }: { rows: CampaignWowRow[]; platforms: Platform[]; blendedSpend: number }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "spend", dir: "desc" });
  const [quick, setQuick] = useState<Quick>("all");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const minSpend = Math.max(25, blendedSpend * 0.02);
  const hasSocial = rows.some((r) => r.current.reach !== null || r.previous.reach !== null);
  const columns = hasSocial ? COLUMNS : COLUMNS.filter((c) => c.key !== "reach" && c.key !== "frequency");

  const visible = useMemo(() => {
    const list = rows.filter((r) => (platform === "all" || r.platform === platform) && matches(r, quick, minSpend));
    const key = sort.key;
    return [...list].sort((a, b) => {
      const av = val(a, key);
      const bv = val(b, key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sort.dir === "desc" ? bv - av : av - bv;
    });
  }, [rows, platform, quick, sort, minSpend]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "costPerConversion" || key === "cpc" || key === "cpm" ? "asc" : "desc" }));
  const counts = Object.fromEntries(QUICK.map((q) => [q.key, rows.filter((r) => (platform === "all" || r.platform === platform) && matches(r, q.key, minSpend)).length])) as Record<Quick, number>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 px-5">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-md bg-surface-2 p-1">
          {QUICK.map((q) => (
            <button key={q.key} type="button" onClick={() => setQuick(q.key)} className={cn("rounded-sm px-2 py-1 text-xs font-medium transition-colors", quick === q.key ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground")}>
              {q.label} <span className="tnum text-muted-2">{counts[q.key]}</span>
            </button>
          ))}
        </div>
        {platforms.length > 1 ? (
          <div className="inline-flex items-center gap-1 rounded-md bg-surface-2 p-1">
            {(["all", ...platforms] as Array<Platform | "all">).map((p) => (
              <button key={p} type="button" onClick={() => setPlatform(p)} className={cn("rounded-sm px-2 py-1 text-xs font-medium capitalize transition-colors", platform === p ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground")}>
                {p === "all" ? "All platforms" : p}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            {columns.map((c) => (
              <TableHead key={c.key} className="text-right">
                <button type="button" onClick={() => toggle(c.key)} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort.key === c.key && "text-foreground")} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.label}
                  <span aria-hidden className="text-[9px]">
                    {sort.key === c.key ? (sort.dir === "desc" ? "▼" : "▲") : "↕"}
                  </span>
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="max-w-[20rem]">
                <div className="flex min-w-0 items-center gap-2">
                  <PlatformBadge platform={r.platform} short />
                  <Link href={`/campaigns/${r.id}`} className="min-w-0 truncate text-sm font-medium hover:underline" title={r.name}>
                    {r.name}
                  </Link>
                </div>
                <div className="flex items-center gap-2 pl-0.5 text-[11px] text-muted-2">
                  <span>{r.channelType}</span>
                  {r.status !== "active" ? <Badge variant="outline">{r.status}</Badge> : null}
                  {r.previous.spend === 0 && r.current.spend > 0 ? <Badge variant="info">New this period</Badge> : null}
                </div>
              </TableCell>
              <TableCell>
                <WowCell value={r.current.spend} previous={r.previous.spend} format="currency" direction="neutral" />
              </TableCell>
              <TableCell>
                <WowCell value={r.current.conversions} previous={r.previous.conversions} format="number" direction="higher_better" />
              </TableCell>
              <TableCell>
                <WowCell value={r.rates.costPerConversion} previous={r.previousRates.costPerConversion} format="currency2" direction="lower_better" />
              </TableCell>
              <TableCell className="tnum text-right text-sm">{fmtReportMetric(r.current.impressions, "number")}</TableCell>
              <TableCell className="tnum text-right text-sm">{fmtReportMetric(r.current.clicks, "number")}</TableCell>
              <TableCell>
                <div className="tnum flex flex-col items-end leading-tight">
                  <span className="text-sm">{fmtReportMetric(r.rates.ctr, "pct")}</span>
                  <WowDelta change={r.ctrChange} direction="higher_better" className="text-[11px]" />
                </div>
              </TableCell>
              {hasSocial ? (
                <>
                  <TableCell className="tnum text-right text-sm">{fmtReportMetric(r.current.reach, "number")}</TableCell>
                  <TableCell>
                    <div className="tnum flex flex-col items-end leading-tight">
                      <span className="text-sm">{fmtReportMetric(r.current.frequency, "multiple")}</span>
                      {r.current.frequency !== null ? <WowDelta change={r.frequencyChange} direction="neutral" className="text-[11px]" /> : null}
                    </div>
                  </TableCell>
                </>
              ) : null}
              <TableCell>
                <div className="tnum flex flex-col items-end leading-tight">
                  <span className="text-sm">{fmtReportMetric(r.rates.cpc, "currency2")}</span>
                  <WowDelta change={r.cpcChange} direction="lower_better" className="text-[11px]" />
                </div>
              </TableCell>
              <TableCell className="tnum text-right text-sm">{fmtReportMetric(r.rates.cpm, "cpm")}</TableCell>
            </TableRow>
          ))}
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="text-xs text-muted">
                No campaigns match this view.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

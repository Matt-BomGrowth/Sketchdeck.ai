import Link from "next/link";
import type { CreativeInsight } from "@/agent/analyzers/creative-pipeline";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FatiguePill, HealthPill, PlatformBadge } from "@/components/dashboard/status";
import { fmtCompactCurrency, fmtCurrency, fmtMultiple, fmtPct } from "@/lib/utils/format";

/** Renders a real asset when available, a text preview for text ads, and an honest placeholder otherwise. */
export function CreativePreview({ item }: { item: CreativeInsight }) {
  const c = item.creative;
  if ((c.assetStatus === "asset" || c.assetStatus === "preview") && (c.assetUrl || c.thumbnailUrl || c.previewUrl)) {
    const src = c.thumbnailUrl ?? c.assetUrl ?? c.previewUrl!;
    return (
      <div className="relative aspect-[1.91/1] w-full overflow-hidden rounded-md bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote platform asset URLs (googlesyndication, fbcdn) */}
        <img src={src} alt={c.headline || c.name} className="size-full object-cover" loading="lazy" />
        {c.assetStatus === "preview" ? <Badge variant="outline" className="absolute bottom-2 left-2 bg-surface/80">Preview URL</Badge> : null}
      </div>
    );
  }
  if (c.type === "text") {
    return (
      <div className="flex aspect-[1.91/1] w-full flex-col justify-center gap-1 rounded-md border border-border bg-surface-2 px-4 py-3">
        <span className="text-[10px] uppercase tracking-wide text-muted">Sponsored · {c.landingUrl?.replace(/^https?:\/\//, "") ?? "sketchdeck.ai"}</span>
        <span className="line-clamp-2 text-sm font-semibold text-info">{c.headline}</span>
        <span className="line-clamp-2 text-xs text-muted">{c.primaryText}</span>
      </div>
    );
  }
  return (
    <div className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-surface-2 px-4 text-center">
      <span className="text-xs font-medium">{c.assetStatus === "demo" ? "Demo creative — no asset" : "Creative unavailable"}</span>
      <span className="text-[11px] text-muted">
        {c.assetStatus === "demo" ? `${c.type} · copy shown below; AdPilot never fabricates media.` : "Creative asset unavailable through current platform permissions."}
      </span>
    </div>
  );
}

export function CreativeCard({ item, rank }: { item: CreativeInsight; rank?: number }) {
  const c = item.creative;
  const m = item.metrics;
  return (
    <Card className="flex flex-col gap-3 p-3">
      <CreativePreview item={item} />
      <div className="flex flex-wrap items-center gap-1.5">
        {typeof rank === "number" ? <span className="tnum text-xs text-muted-2">#{rank}</span> : null}
        <PlatformBadge platform={c.platform} short />
        <Badge variant="outline" className="capitalize">{c.type}</Badge>
        {c.variant ? <Badge variant="accent">Variant {c.variant}</Badge> : null}
        <span className="ml-auto"><FatiguePill status={item.fatigue.status} /></span>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" title={c.name}>{c.name}</p>
        <p className="line-clamp-1 text-xs text-muted">{c.headline}</p>
        {c.primaryText ? <p className="mt-1 line-clamp-2 text-xs text-muted">{c.primaryText}</p> : null}
        <p className="mt-1 text-[11px] text-muted-2">{c.cta ? `CTA: ${c.cta} · ` : ""}<Link href={`/campaigns/${c.campaignId}`} className="hover:underline">campaign</Link></p>
      </div>
      <dl className="tnum grid grid-cols-3 gap-x-2 gap-y-1 text-[11px]">
        <Stat label="Spend" value={fmtCompactCurrency(item.totals.spend)} />
        <Stat label="CTR" value={fmtPct(m.ctr, 2)} />
        <Stat label="Leads" value={String(item.totals.leads)} />
        <Stat label="MQL rate" value={fmtPct(m.mqlRate)} />
        <Stat label="SQL rate" value={fmtPct(m.sqlRate)} />
        <Stat label="Cost / SQL" value={fmtCurrency(m.costPerSql)} />
        <Stat label="Pipeline" value={fmtCompactCurrency(item.totals.pipeline)} strong />
        <Stat label="Revenue" value={fmtCompactCurrency(item.totals.revenue)} />
        <Stat label="Pipeline ROAS" value={fmtMultiple(m.pipelineRoas)} strong />
      </dl>
      <div className="flex items-center justify-between border-t border-border pt-2">
        <HealthPill score={item.health.score} status={item.health.status} label={item.health.label} />
        <span className="text-[11px] text-muted">Fatigue {item.fatigue.score}/100</span>
      </div>
    </Card>
  );
}

function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-muted-2">{label}</dt>
      <dd className={strong ? "font-semibold" : ""}>{value}</dd>
    </div>
  );
}

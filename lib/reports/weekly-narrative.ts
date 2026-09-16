/**
 * Plain-English summary and "Next Focus" for the weekly report.
 *
 * Every sentence is built from the report's own numbers. Nothing here labels
 * a movement good or bad unless the metric's direction makes it so (cost per
 * conversion down = more efficient); spend and volume changes are described,
 * not judged.
 */

import type { AdWowRow, CampaignWowRow, PlatformWowRow, WeeklyReport } from "./weekly";
import { fmtCurrency, fmtPct } from "@/lib/utils/format";

const pct = (v: number | null) => (v === null ? "n/a" : `${Math.abs(v * 100).toFixed(v !== null && Math.abs(v) < 0.1 ? 1 : 0)}%`);
const dir = (v: number | null, up = "up", down = "down") => (v === null ? "" : v >= 0 ? up : down);
const money = (v: number | null) => fmtCurrency(v, { cents: v !== null && v < 100 });
const STABLE = 0.05;

function clip(s: string, n = 48) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function weeklySummary(r: WeeklyReport): string[] {
  const b = r.blended;
  const out: string[] = [];
  const hasPrev = b.previous.spend > 0 || b.previous.conversions > 0;
  if (b.current.spend === 0 && b.previous.spend === 0) return ["No ad spend was recorded in this period or the one before it. Connect an ad platform and run a scan to populate the report."];
  if (!hasPrev) {
    out.push(`Spend was ${money(b.current.spend)} with ${b.current.conversions} conversions${b.rates.costPerConversion !== null ? ` at ${money(b.rates.costPerConversion)} each` : ""}; there is no data for the previous period yet, so week-over-week comparisons start next period.`);
  } else {
    // 1. What changed, and did efficiency move.
    const cpcv = b.costPerConversionChange;
    const eff =
      b.current.conversions === 0
        ? "no conversions were recorded this period"
        : cpcv === null
          ? `cost per conversion is ${money(b.rates.costPerConversion)} (no conversions in the previous period to compare)`
          : Math.abs(cpcv) < STABLE
            ? `keeping cost per conversion roughly stable at ${money(b.rates.costPerConversion)}`
            : cpcv < 0
              ? `improving cost per conversion ${pct(cpcv)} to ${money(b.rates.costPerConversion)}`
              : `pushing cost per conversion up ${pct(cpcv)} to ${money(b.rates.costPerConversion)}`;
    out.push(`Overall spend went ${dir(b.spendChange)} ${pct(b.spendChange)} to ${money(b.current.spend)} while conversions went ${dir(b.conversionsChange)} ${pct(b.conversionsChange)} (${b.previous.conversions} → ${b.current.conversions}), ${eff}.`);

    // 2. Which platform drove it.
    const active = r.platforms.filter((p) => p.current.spend > 0 || p.previous.spend > 0);
    if (active.length > 1) {
      const delta = b.current.spend - b.previous.spend;
      const movers = active.map((p) => ({ p, d: p.current.spend - p.previous.spend })).filter((m) => Math.abs(m.d) > 0).sort((a, c) => Math.abs(c.d) - Math.abs(a.d));
      const opposite = movers.filter((m) => Math.sign(m.d) !== Math.sign(delta) && Math.abs(m.d) >= Math.abs(delta) * 0.2);
      if (movers.length && Math.abs(delta) > 0) {
        if (opposite.length) {
          // Platforms pulled in different directions: name the movers instead of a share of the net change.
          const same = movers.filter((m) => Math.sign(m.d) === Math.sign(delta));
          const list = (ms: typeof movers) => ms.map((m) => `${m.p.label} (${m.d > 0 ? "+" : "−"}${money(Math.abs(m.d))})`).join(" and ");
          out.push(`${list(same)} spent ${delta > 0 ? "more" : "less"} while ${list(opposite)} spent ${delta > 0 ? "less" : "more"}, netting ${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}.`);
        } else {
          const lead = movers[0];
          const share = Math.min(1.5, Math.abs(lead.d / delta));
          out.push(`${lead.p.label} accounted for ${share >= 0.95 ? "essentially all" : `${Math.round(share * 100)}%`} of the ${delta > 0 ? "increase" : "decrease"} in spend (${money(Math.abs(lead.d))} ${lead.d > 0 ? "more" : "less"}).`);
        }
      }
      const diverging = active.filter((p) => p.conversionsChange !== null && p.previous.conversions >= 3 && Math.sign(p.conversionsChange) !== Math.sign(b.conversionsChange ?? 0) && Math.abs(p.conversionsChange) >= 0.1);
      if (diverging.length) out.push(`${diverging.map((p) => `${p.label} moved the other way on conversions (${dir(p.conversionsChange)} ${pct(p.conversionsChange)})`).join("; ")}.`);
    } else if (active.length === 1) {
      out.push(`${active[0].label} is the only platform with spend in this period.`);
    }
  }

  // 3. Campaigns that stood out.
  const withConv = r.campaigns.filter((c) => c.current.conversions >= 3 && c.rates.costPerConversion !== null);
  const best = [...withConv].sort((a, c) => a.rates.costPerConversion! - c.rates.costPerConversion!)[0];
  const gainers = [...r.campaigns].filter((c) => c.current.conversions - c.previous.conversions !== 0).sort((a, c) => c.current.conversions - c.previous.conversions - (a.current.conversions - a.previous.conversions));
  const topGain = gainers[0];
  const topLoss = gainers[gainers.length - 1];
  const parts: string[] = [];
  if (best) parts.push(`${clip(best.name)} had the strongest conversion efficiency at ${money(best.rates.costPerConversion)} per conversion (${best.current.conversions} conversions)`);
  if (topGain && topGain.current.conversions - topGain.previous.conversions > 0 && topGain.id !== best?.id) parts.push(`${clip(topGain.name)} added the most conversions (${topGain.previous.conversions} → ${topGain.current.conversions})`);
  if (topLoss && topLoss.current.conversions - topLoss.previous.conversions < 0 && topLoss.previous.conversions >= 3) parts.push(`${clip(topLoss.name)} lost the most (${topLoss.previous.conversions} → ${topLoss.current.conversions})`);
  if (parts.length) out.push(`${parts.join("; ")}.`);

  // 4. Click-side efficiency.
  if (hasPrev && b.ctrChange !== null && b.cpcChange !== null) {
    const ctrWord = Math.abs(b.ctrChange) < STABLE ? "held steady" : `${dir(b.ctrChange, "rose", "fell")} ${pct(b.ctrChange)}`;
    const cpcWord = Math.abs(b.cpcChange) < STABLE ? "was flat" : `${dir(b.cpcChange, "rose", "fell")} ${pct(b.cpcChange)}`;
    out.push(`CTR ${ctrWord} at ${fmtPct(b.rates.ctr, 2)} and CPC ${cpcWord} at ${money(b.rates.cpc)}.`);
  }
  return out;
}

export interface FocusItem {
  id: string;
  title: string;
  detail: string;
  /** Who / what to look at. */
  scope: "blended" | "platform" | "campaign" | "ad";
  campaignId?: string;
  /** Spend involved, for ordering within a kind. */
  weight: number;
  /** Short form used when several findings fold into one campaign line. */
  short?: string;
}

/** Kinds in the order they are worth a marketer's attention; ties broken by spend. */
const KIND_PRIORITY = ["spend-up-conv-down", "best-cpa", "ad-spend-few-conv", "frequency-up", "blended-cpc", "spend-down", "ctr-down", "cpc-up"];

/** Data-driven things worth investigating next period. No generic advice. */
export function nextFocus(r: WeeklyReport, limit = 8): FocusItem[] {
  const out: FocusItem[] = [];
  const b = r.blended;
  const minSpend = Math.max(50, b.current.spend * 0.03);

  for (const c of r.campaigns) {
    if (c.status !== "active" && c.current.spend === 0) continue;
    const convDelta = c.current.conversions - c.previous.conversions;
    if (c.spendChange !== null && c.spendChange >= 0.2 && c.current.spend >= minSpend && convDelta <= 0 && c.previous.conversions > 0) {
      out.push(focus(`spend-up-conv-down:${c.id}`, `${clip(c.name)} spent ${pct(c.spendChange)} more but conversions ${convDelta === 0 ? "did not move" : `fell ${c.previous.conversions} → ${c.current.conversions}`}`, `${money(c.previous.spend)} → ${money(c.current.spend)} · cost per conversion ${money(c.previousRates.costPerConversion)} → ${money(c.rates.costPerConversion)}`, c, c.current.spend, `spend +${pct(c.spendChange)} with conversions ${c.previous.conversions} → ${c.current.conversions}`));
    }
    if (c.spendChange !== null && c.spendChange <= -0.3 && c.previous.spend >= minSpend) {
      out.push(focus(`spend-down:${c.id}`, `${clip(c.name)} spent ${pct(c.spendChange)} less than the previous period`, `${money(c.previous.spend)} → ${money(c.current.spend)}${c.status !== "active" ? ` · campaign is ${c.status}` : " · check whether this was a budget change, a pause, or lost auctions"}`, c, c.current.spend, `spend −${pct(c.spendChange)}`));
    }
    if (c.ctrChange !== null && c.ctrChange <= -0.15 && c.current.impressions >= 1000) {
      out.push(focus(`ctr-down:${c.id}`, `CTR fell ${pct(c.ctrChange)} on ${clip(c.name)}`, `${fmtPct(c.previousRates.ctr, 2)} → ${fmtPct(c.rates.ctr, 2)} on ${c.current.impressions.toLocaleString()} impressions`, c, c.current.spend * 0.8, `CTR −${pct(c.ctrChange)} (${fmtPct(c.previousRates.ctr, 2)} → ${fmtPct(c.rates.ctr, 2)})`));
    }
    if (c.cpcChange !== null && c.cpcChange >= 0.2 && c.current.spend >= minSpend) {
      out.push(focus(`cpc-up:${c.id}`, `CPC rose ${pct(c.cpcChange)} on ${clip(c.name)}`, `${money(c.previousRates.cpc)} → ${money(c.rates.cpc)} · ${c.current.clicks} clicks`, c, c.current.spend * 0.7, `CPC +${pct(c.cpcChange)} (${money(c.previousRates.cpc)} → ${money(c.rates.cpc)})`));
    }
    if (c.frequencyChange !== null && c.frequencyChange >= 0.15 && (c.current.frequency ?? 0) >= 3 && c.platform !== "google") {
      out.push(focus(`frequency-up:${c.id}`, `Frequency is climbing on ${clip(c.name)} (${c.previous.frequency?.toFixed(1)} → ${c.current.frequency?.toFixed(1)})`, `Audience is seeing the ads ${c.current.frequency?.toFixed(1)}× on average · CTR ${fmtPct(c.previousRates.ctr, 2)} → ${fmtPct(c.rates.ctr, 2)}`, c, c.current.spend * 0.9, `frequency ${c.previous.frequency?.toFixed(1)} → ${c.current.frequency?.toFixed(1)}`));
    }
  }

  const withConv = r.campaigns.filter((c) => c.current.conversions >= 3 && c.rates.costPerConversion !== null);
  const best = [...withConv].sort((a, c) => a.rates.costPerConversion! - c.rates.costPerConversion!)[0];
  if (best && b.rates.costPerConversion !== null && best.rates.costPerConversion! < b.rates.costPerConversion * 0.8) {
    out.push(focus(`best-cpa:${best.id}`, `${clip(best.name)} has the lowest cost per conversion (${money(best.rates.costPerConversion)} vs ${money(b.rates.costPerConversion)} blended)`, `${best.current.conversions} conversions on ${money(best.current.spend)} · worth understanding what is different before scaling it`, best, best.current.spend, `lowest cost per conversion (${money(best.rates.costPerConversion)})`));
  }

  // Ads: high spend, few conversions.
  const adSpend = r.ads.map((a) => a.current.spend).sort((a, c) => c - a);
  const topQuartile = adSpend[Math.floor(adSpend.length * 0.25)] ?? 0;
  const adThreshold = Math.max(minSpend, Math.min(topQuartile, b.current.spend * 0.1));
  for (const a of r.ads) {
    if (a.current.spend < adThreshold || a.current.spend <= 0) continue;
    const cpa = a.rates.costPerConversion;
    if (a.current.conversions === 0 || (cpa !== null && b.rates.costPerConversion !== null && cpa > b.rates.costPerConversion * 2)) {
      out.push({
        id: `ad-spend-few-conv:${a.creative.id}`,
        title: `${clip(adLabel(a), 40)} took ${money(a.current.spend)} for ${a.current.conversions} conversion${a.current.conversions === 1 ? "" : "s"}`,
        detail: `${clip(a.campaignName, 40)} · ${a.current.clicks} clicks · CTR ${fmtPct(a.rates.ctr, 2)}${cpa !== null ? ` · ${money(cpa)} per conversion vs ${money(b.rates.costPerConversion)} blended` : ""}`,
        scope: "ad",
        campaignId: a.campaignId,
        weight: a.current.spend,
      });
    }
  }

  // Blended CPC.
  if (b.cpcChange !== null && b.cpcChange >= 0.2 && b.current.clicks >= 50) {
    out.push({ id: "blended-cpc", title: `Blended CPC rose ${pct(b.cpcChange)} week over week`, detail: `${money(b.previousRates.cpc)} → ${money(b.rates.cpc)} · ${r.platforms.filter((p) => p.cpcChange !== null && p.cpcChange >= 0.15).map((p) => `${p.label} ${dir(p.cpcChange, "+", "−")}${pct(p.cpcChange)}`).join(", ") || "spread across platforms"}`, scope: "blended", weight: b.current.spend });
  }

  const seen = new Set<string>();
  const kind = (f: FocusItem) => f.id.split(":")[0];
  const ranked = out
    .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .sort((a, c) => KIND_PRIORITY.indexOf(kind(a)) - KIND_PRIORITY.indexOf(kind(c)) || c.weight - a.weight);
  // One item per campaign: the highest-priority finding leads, the others fold into its detail.
  const byCampaign = new Map<string, FocusItem>();
  const merged: FocusItem[] = [];
  for (const f of ranked) {
    const key = f.scope === "campaign" && f.campaignId ? f.campaignId : f.id;
    const existing = byCampaign.get(key);
    if (existing) {
      if (f.short) existing.detail = `${existing.detail} · Also: ${f.short}`;
      continue;
    }
    byCampaign.set(key, f);
    merged.push(f);
  }
  return merged.slice(0, limit);
}

function focus(id: string, title: string, detail: string, c: CampaignWowRow, weight = c.current.spend, short?: string): FocusItem {
  return { id, title, detail, scope: "campaign", campaignId: c.id, weight, short };
}

export function adLabel(a: AdWowRow) {
  return a.creative.headline || a.creative.name;
}

export type { PlatformWowRow };

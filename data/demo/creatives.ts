import type { Creative, CreativeDailyMetric, DailyMetric, Platform } from "@/types/domain";
import { createRng, hashString } from "@/lib/utils/prng";
import type { DemoCampaignDef } from "./campaigns";
import { SKETCHDECK } from "./sketchdeck";

interface CreativeSeed {
  name: string;
  type: Creative["type"];
  headline: string;
  primaryText: string;
  description?: string;
  cta: string;
  /** Relative share of campaign spend. */
  weight: number;
  /** Relative pipeline efficiency vs campaign average (1 = average). */
  quality: number;
  /** CTR multiplier vs campaign average. */
  ctrMult: number;
  /** Decay multiplier applied over final 14 days (0 = none, 0.5 = loses half its CTR). */
  fatigue?: number;
  testGroup?: string;
  variant?: "A" | "B" | "C";
}

const DEMO = SKETCHDECK.demoUrl;

/**
 * Real SketchDeck messaging themes (from the live Google Ads account) are used
 * for text creatives. Demo creatives intentionally carry NO media assets —
 * AdPilot never fabricates creative images.
 */
const LIBRARY: Record<string, CreativeSeed[]> = {
  search_core: [
    { name: "RSA · Takeoffs in Minutes", type: "text", headline: "Steel Takeoffs in Minutes, Not Hours", primaryText: "Upload drawings and get steel quantities + BOM fast. Book a live demo on your own project.", description: "80% faster steel estimating. Free trial on your next bid.", cta: "Book a Demo", weight: 0.45, quality: 1.15, ctrMult: 1.0 },
    { name: "RSA · Stop Manual Counting", type: "text", headline: "Still Counting Steel Manually?", primaryText: "LIFT automates structural steel takeoffs from PDFs. 95–99% accuracy. Try it on your next bid.", description: "The #1 AI steel estimating tool for fabricators.", cta: "Try For Free", weight: 0.35, quality: 0.9, ctrMult: 1.1 },
    { name: "RSA · More Bids Same Team", type: "text", headline: "More Bids Without Hiring", primaryText: "Scale estimating without adding headcount. Turn more bids around each week with AI takeoffs.", description: "Trusted by top fabricators. $25B+ in bids.", cta: "See a Live Demo", weight: 0.2, quality: 1.3, ctrMult: 0.85 },
  ],
  search_generic: [
    { name: "RSA · Primary", type: "text", headline: "AI Steel Takeoff Software", primaryText: "Turn drawings into a bid-ready BOM in minutes. Reduce bid time by up to 65%.", cta: "Book a Demo", weight: 0.6, quality: 1.0, ctrMult: 1.0 },
    { name: "RSA · Accuracy Angle", type: "text", headline: "95–99% Takeoff Accuracy", primaryText: "Reduce missed steel and rework. Consistent, repeatable takeoffs for estimators.", cta: "See It On Your Plans", weight: 0.4, quality: 1.0, ctrMult: 0.95 },
  ],
  social_generic: [
    { name: "Creative A · Drawing → BOM (video)", type: "video", headline: "From Drawings to BOM in Minutes", primaryText: "Watch LIFT read a structural drawing set and produce a complete steel BOM. Built for fabricators who bid more than they can count.", cta: "Book a Demo", weight: 0.4, quality: 1.0, ctrMult: 1.1, testGroup: "Hook test", variant: "A" },
    { name: "Creative B · Chief Estimator testimonial", type: "image", headline: "\"We bid 3× more jobs with the same team.\"", primaryText: "Hear how a 120-person fabricator cut takeoff time by 80% with LIFT. Free trial on your next bid.", cta: "Read the Story", weight: 0.35, quality: 1.35, ctrMult: 0.85, testGroup: "Hook test", variant: "B" },
    { name: "Creative C · Free trial offer", type: "image", headline: "Try LIFT Free On Your Next Bid", primaryText: "Upload a real project. Get quantities and a BOM back in minutes. No credit card.", cta: "Start Free Trial", weight: 0.25, quality: 0.7, ctrMult: 1.35, testGroup: "Hook test", variant: "C" },
  ],
  linkedin_exec: [
    { name: "Creative A · ROI one-pager (document)", type: "document", headline: "The Fabricator's Guide to AI Takeoffs", primaryText: "How estimating leaders at AISC-certified fabricators are adding bid capacity without adding estimators.", cta: "Download", weight: 0.45, quality: 1.4, ctrMult: 0.8 },
    { name: "Creative B · Case study carousel", type: "carousel", headline: "80% Faster Takeoffs at a 300-Person Fabricator", primaryText: "Five slides: the bottleneck, the fix, the numbers. Built for VP-level estimating leaders.", cta: "See the Numbers", weight: 0.35, quality: 1.1, ctrMult: 1.0 },
    { name: "Creative C · Product demo (video)", type: "video", headline: "Watch a Live Steel Takeoff in 90 Seconds", primaryText: "LIFT turns drawings into steel quantities and a shop-ready BOM. See it on a real project.", cta: "Book a Demo", weight: 0.2, quality: 0.85, ctrMult: 1.2 },
  ],
  fatiguing_social: [
    { name: "Creative A · Launch hook (fatigued)", type: "video", headline: "Stop Highlighting Drawings", primaryText: "Launched 8 weeks ago. Frequency is climbing and CTR is falling — time for a refresh.", cta: "Book a Demo", weight: 0.55, quality: 0.9, ctrMult: 1.0, fatigue: 0.55 },
    { name: "Creative B · Case study (fresh)", type: "image", headline: "How a Texas Fabricator Bid 40% More Work", primaryText: "New creative. Same offer, stronger proof.", cta: "Read the Story", weight: 0.45, quality: 1.25, ctrMult: 0.95 },
  ],
};

function pickLibrary(def: DemoCampaignDef): CreativeSeed[] {
  if (def.platform === "google" && def.channelType === "Search") return def.id === "cmp_g_core_phrases" ? LIBRARY.search_core : LIBRARY.search_generic;
  if (def.profile === "fatiguing") return LIBRARY.fatiguing_social;
  if (def.platform === "linkedin" && (def.profile === "low_ctr_excellent_pipeline" || def.profile === "high_cpl_excellent_sql" || def.profile === "high_performing")) return LIBRARY.linkedin_exec;
  return LIBRARY.social_generic;
}

export function buildDemoCreatives(defs: DemoCampaignDef[], dailyMetrics: DailyMetric[]) {
  const creatives: Creative[] = [];
  const creativeDailyMetrics: CreativeDailyMetric[] = [];

  for (const def of defs) {
    const seeds = pickLibrary(def);
    const rows = dailyMetrics.filter((r) => r.campaignId === def.id).sort((a, b) => (a.date < b.date ? -1 : 1));
    const rng = createRng(hashString(`creatives:${def.id}`));
    const ids = seeds.map((s, i) => `cr_${def.id.replace("cmp_", "")}_${i + 1}`);

    seeds.forEach((s, i) => {
      creatives.push({
        id: ids[i],
        campaignId: def.id,
        platform: def.platform as Platform,
        externalId: `demo-${ids[i]}`,
        name: s.name,
        type: s.type,
        status: def.status ?? "active",
        headline: s.headline,
        primaryText: s.primaryText,
        description: s.description,
        cta: s.cta,
        landingUrl: DEMO,
        assetStatus: "demo",
        testGroup: s.testGroup ? `${def.name} · ${s.testGroup}` : undefined,
        variant: s.variant,
      });
    });

    const n = rows.length;
    rows.forEach((row, idx) => {
      const daysFromEnd = n - 1 - idx;
      const t = Math.max(0, 1 - daysFromEnd / 14);
      // Compute effective weights with fatigue decay on CTR.
      const eff = seeds.map((s) => {
        const decay = s.fatigue ? 1 - s.fatigue * t : 1;
        return { spendW: s.weight, ctrW: s.weight * s.ctrMult * decay, qualW: s.weight * s.quality * (s.fatigue ? 1 - 0.5 * s.fatigue * t : 1) };
      });
      const spendSum = eff.reduce((a, e) => a + e.spendW, 0) || 1;
      const ctrSum = eff.reduce((a, e) => a + e.ctrW, 0) || 1;
      const qualSum = eff.reduce((a, e) => a + e.qualW, 0) || 1;

      let allocated = { clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0, impressions: 0, spend: 0 };
      seeds.forEach((s, i) => {
        const last = i === seeds.length - 1;
        const sShare = eff[i].spendW / spendSum;
        const cShare = eff[i].ctrW / ctrSum;
        const qShare = eff[i].qualW / qualSum;
        const jitter = 1 + rng.normal(0, 0.05);
        const m: CreativeDailyMetric = {
          creativeId: ids[i],
          date: row.date,
          spend: last ? row.spend - allocated.spend : Math.round(row.spend * sShare * jitter * 100) / 100,
          impressions: last ? row.impressions - allocated.impressions : Math.round(row.impressions * sShare),
          clicks: last ? row.clicks - allocated.clicks : Math.round(row.clicks * cShare),
          leads: last ? row.leads - allocated.leads : Math.round(row.leads * cShare),
          mqls: last ? row.mqls - allocated.mqls : Math.round(row.mqls * qShare),
          sqls: last ? row.sqls - allocated.sqls : Math.round(row.sqls * qShare),
          opportunities: last ? row.opportunities - allocated.opportunities : Math.round(row.opportunities * qShare),
          pipeline: last ? row.pipeline - allocated.pipeline : Math.round(row.pipeline * qShare),
          revenue: last ? row.revenue - allocated.revenue : Math.round(row.revenue * qShare),
        };
        if (typeof row.frequency === "number") m.frequency = row.frequency * (s.fatigue ? 1 + 0.3 * t : 1);
        for (const k of Object.keys(allocated) as Array<keyof typeof allocated>) {
          m[k] = Math.max(0, m[k]);
          allocated[k] += m[k];
        }
        creativeDailyMetrics.push(m);
      });
      allocated = { clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0, impressions: 0, spend: 0 };
    });
  }

  return { creatives, creativeDailyMetrics };
}

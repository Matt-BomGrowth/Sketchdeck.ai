import type {
  AudienceSegmentMetric,
  Campaign,
  Creative,
  CreativeDailyMetric,
  DailyMetric,
  Organization,
} from "@/types/domain";
import { createRng, hashString } from "@/lib/utils/prng";
import { addDays, parseISODate, toISODate } from "@/lib/utils/dates";
import { DEMO_CAMPAIGNS, DEMO_ORG_ID, toCampaign, type DemoCampaignDef } from "./campaigns";
import { PROFILES } from "./profiles";
import { SKETCHDECK } from "./sketchdeck";
import { buildDemoCreatives } from "./creatives";

export interface DemoDataset {
  organization: Organization;
  campaigns: Campaign[];
  dailyMetrics: DailyMetric[];
  creatives: Creative[];
  creativeDailyMetrics: CreativeDailyMetric[];
  audienceSegments: AudienceSegmentMetric[];
  /** Inclusive end date (YYYY-MM-DD) of generated history. */
  endDate: string;
  startDate: string;
  historyDays: number;
}

const HISTORY_DAYS = 120;

/** Weekday multiplier for B2B (Mon–Fri high, weekend low). */
function weekdayFactor(date: Date) {
  const d = date.getUTCDay();
  if (d === 0) return 0.45;
  if (d === 6) return 0.55;
  if (d === 1 || d === 5) return 0.92;
  return 1.05;
}

export function generateDemoDataset(endDate: string, options: { historyDays?: number } = {}): DemoDataset {
  const historyDays = options.historyDays ?? HISTORY_DAYS;
  const end = parseISODate(endDate);
  const start = addDays(end, -(historyDays - 1));
  const startDate = toISODate(start);

  const organization: Organization = {
    id: DEMO_ORG_ID,
    name: SKETCHDECK.company,
    slug: "sketchdeck",
    currency: SKETCHDECK.currency,
    timezone: SKETCHDECK.timezone,
  };

  const campaigns = DEMO_CAMPAIGNS.map((def) => toCampaign(def, toISODate(addDays(start, -30))));
  const dailyMetrics: DailyMetric[] = [];

  for (const def of DEMO_CAMPAIGNS) {
    const rows = generateCampaignSeries(def, startDate, historyDays);
    dailyMetrics.push(...rows);
  }

  const { creatives, creativeDailyMetrics } = buildDemoCreatives(DEMO_CAMPAIGNS, dailyMetrics);
  const audienceSegments = buildAudienceSegments(DEMO_CAMPAIGNS, dailyMetrics, endDate);

  return { organization, campaigns, dailyMetrics, creatives, creativeDailyMetrics, audienceSegments, endDate, startDate, historyDays };
}

export function generateCampaignSeries(def: DemoCampaignDef, startDate: string, days: number): DailyMetric[] {
  const p = PROFILES[def.profile];
  const rng = createRng(hashString(`${def.id}:${startDate}`));
  const rows: DailyMetric[] = [];
  const start = parseISODate(startDate);
  const paused = def.status === "paused";
  // Paused campaigns ran for the first ~35 days then stopped.
  const pausedAfter = 35;
  const pausedBudget = 90;
  let oppAccumulator = rng.next() * 0.8;

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const iso = toISODate(date);
    const isActive = !paused || i < pausedAfter;
    if (!isActive) {
      rows.push(emptyRow(def.id, iso));
      continue;
    }

    // Fatigue / trend: applies over the final `fatigueDays` of history.
    const daysFromEnd = days - 1 - i;
    const t = Math.max(0, 1 - daysFromEnd / p.fatigueDays); // 0 → 1 over final window
    const ctr = Math.max(0.002, p.ctr * (1 + p.ctrTrend * t) * (1 + rng.normal(0, 0.12)));
    const cpc = Math.max(0.5, p.cpc * (1 + p.cpcTrend * t) * (1 + rng.normal(0, 0.1)));

    const budget = paused ? pausedBudget : def.dailyBudget;
    const spendTarget = budget * weekdayFactor(date) * (1 + rng.normal(0, 0.08));
    const spend = Math.max(0, Math.round(Math.min(spendTarget, budget * 1.15) * 100) / 100);
    const clicks = Math.max(0, Math.round(spend / cpc));
    const impressions = Math.max(clicks, Math.round(clicks / ctr));

    // Fatigue also erodes downstream conversion a little.
    const convErosion = p.ctrTrend < -0.2 ? 1 - 0.35 * t : 1;
    const leads = rng.binomial(clicks, Math.min(1, p.clickToLead * convErosion));
    const mqls = rng.binomial(leads, p.leadToMql);
    const sqls = rng.binomial(mqls, p.mqlToSql * (p.ctrTrend < -0.2 ? 1 - 0.2 * t : 1));
    // Opportunities accrue from SQLs via a fractional accumulator so pipeline
    // lands at a realistic cadence instead of as rare random lumps.
    oppAccumulator += sqls * p.sqlToOpp * Math.max(0.5, 1 + rng.normal(0, 0.25));
    let opportunities = 0;
    while (oppAccumulator >= 1) {
      opportunities++;
      oppAccumulator -= 1;
    }

    let pipeline = 0;
    for (let k = 0; k < opportunities; k++) {
      pipeline += def.dealSize * p.dealSizeMult * Math.max(0.4, 1 + rng.normal(0, 0.3));
    }
    pipeline = Math.round(pipeline);
    // Revenue closes probabilistically from pipeline; a portion lands same-window for demo clarity.
    const revenue = Math.round(pipeline * p.winRate * Math.max(0, 1 + rng.normal(0, 0.4)));

    const row: DailyMetric = { campaignId: def.id, date: iso, spend, impressions, clicks, leads, mqls, sqls, opportunities, pipeline, revenue };
    if (def.isPaidSocial) {
      const base = p.frequencyBase ?? 1.8;
      const trend = p.frequencyTrend ?? 0.3;
      row.frequency = Math.round((base + trend * t + rng.normal(0, 0.1)) * 100) / 100;
    }
    rows.push(row);
  }
  return rows;
}

function emptyRow(campaignId: string, date: string): DailyMetric {
  return { campaignId, date, spend: 0, impressions: 0, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 };
}

/**
 * Allocate each campaign's 90-day totals across ICP segments using the
 * campaign's audience weights, with quality multipliers so that senior /
 * enterprise buyers produce more SQL and pipeline per dollar (which is what
 * SketchDeck actually sees: owners and VPs of estimating sign the contracts).
 */
const QUALITY: Record<string, number> = {
  "Owner / C-level": 1.7, VP: 1.6, Director: 1.1, Manager: 0.8, "Individual contributor": 0.35,
  "10–50 employees": 0.75, "51–200 employees": 1.05, "201–500 employees": 1.35, "500+ employees": 1.6,
  "Chief Estimator": 1.3, "Estimating Manager": 1.0, "VP of Estimating": 1.7, "Owner / President": 1.6,
  "Preconstruction Director": 1.2, "Project Manager": 0.5, "Steel Detailer": 0.3,
  Texas: 1.15, Midwest: 1.05, Southeast: 1.0, Northeast: 0.95, "West Coast": 0.9, Alberta: 1.1, Ontario: 1.0,
};

function buildAudienceSegments(defs: DemoCampaignDef[], rows: DailyMetric[], endDate: string): AudienceSegmentMetric[] {
  const end = parseISODate(endDate);
  const start = toISODate(addDays(end, -89));
  const totals = new Map<string, DailyMetric[]>();
  for (const r of rows) {
    if (r.date < start || r.date > endDate) continue;
    const list = totals.get(r.campaignId) ?? [];
    list.push(r);
    totals.set(r.campaignId, list);
  }

  const dims: Array<{ dimension: AudienceSegmentMetric["dimension"]; key: keyof DemoCampaignDef["audience"]; industryLike?: boolean }> = [
    { dimension: "seniority", key: "seniority" },
    { dimension: "company_size", key: "companySize" },
    { dimension: "job_title", key: "jobTitle" },
    { dimension: "geography", key: "geography" },
  ];

  const acc = new Map<string, AudienceSegmentMetric>();
  const bump = (dimension: AudienceSegmentMetric["dimension"], value: string, add: Partial<AudienceSegmentMetric>) => {
    const k = `${dimension}::${value}`;
    const cur = acc.get(k) ?? { dimension, value, spend: 0, impressions: 0, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 };
    cur.spend += add.spend ?? 0;
    cur.impressions += add.impressions ?? 0;
    cur.clicks += add.clicks ?? 0;
    cur.leads += add.leads ?? 0;
    cur.mqls += add.mqls ?? 0;
    cur.sqls += add.sqls ?? 0;
    cur.opportunities += add.opportunities ?? 0;
    cur.pipeline += add.pipeline ?? 0;
    cur.revenue += add.revenue ?? 0;
    acc.set(k, cur);
  };

  for (const def of defs) {
    const list = totals.get(def.id) ?? [];
    const sum = list.reduce(
      (s, r) => ({
        spend: s.spend + r.spend, impressions: s.impressions + r.impressions, clicks: s.clicks + r.clicks, leads: s.leads + r.leads,
        mqls: s.mqls + r.mqls, sqls: s.sqls + r.sqls, opportunities: s.opportunities + r.opportunities, pipeline: s.pipeline + r.pipeline, revenue: s.revenue + r.revenue,
      }),
      { spend: 0, impressions: 0, clicks: 0, leads: 0, mqls: 0, sqls: 0, opportunities: 0, pipeline: 0, revenue: 0 },
    );

    // Industry is a single value per campaign.
    bump("industry", def.industry, sum);

    for (const { dimension, key } of dims) {
      const weights = def.audience[key];
      const entries = Object.entries(weights);
      const wSum = entries.reduce((a, [, w]) => a + w, 0) || 1;
      // Quality-adjusted weights for downstream (MQL+) allocation.
      const qSum = entries.reduce((a, [v, w]) => a + w * (QUALITY[v] ?? 1), 0) || 1;
      for (const [value, w] of entries) {
        const topShare = w / wSum;
        const qualShare = (w * (QUALITY[value] ?? 1)) / qSum;
        bump(dimension, value, {
          spend: sum.spend * topShare,
          impressions: sum.impressions * topShare,
          clicks: sum.clicks * topShare,
          leads: sum.leads * topShare,
          mqls: sum.mqls * (0.5 * topShare + 0.5 * qualShare),
          sqls: sum.sqls * qualShare,
          opportunities: sum.opportunities * qualShare,
          pipeline: sum.pipeline * qualShare,
          revenue: sum.revenue * qualShare,
        });
      }
    }
  }

  return [...acc.values()].map((s) => ({
    ...s,
    spend: Math.round(s.spend), impressions: Math.round(s.impressions), clicks: Math.round(s.clicks), leads: Math.round(s.leads),
    mqls: Math.round(s.mqls), sqls: Math.round(s.sqls), opportunities: Math.round(s.opportunities), pipeline: Math.round(s.pipeline), revenue: Math.round(s.revenue),
  }));
}

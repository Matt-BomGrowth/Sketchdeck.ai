import type { DailyBrief, OptimizationAction, ScanRun } from "@/types/domain";
import type { DemoDataset } from "./generate";
import { addDays, parseISODate, toISODate } from "@/lib/utils/dates";
import { createRng, hashString } from "@/lib/utils/prng";

/**
 * Demo history of prior AI activity: executed/measured actions, scan runs and
 * daily briefs, so the Optimization Log and AI Agent pages demonstrate the
 * complete OBSERVE → RECOMMEND → APPROVE → EXECUTE → MEASURE loop.
 * Clearly demo data — generated, not fabricated as "live".
 */
export function buildDemoHistory(ds: DemoDataset): { actions: OptimizationAction[]; scanRuns: ScanRun[]; briefs: DailyBrief[] } {
  const rng = createRng(hashString(`history:${ds.endDate}`));
  const end = parseISODate(ds.endDate);
  const org = ds.organization.id;
  const byId = new Map(ds.campaigns.map((c) => [c.id, c]));

  const seeds: Array<{ campaignId: string; type: OptimizationAction["actionType"]; daysAgo: number; from: number; to: number; reason: string; expected: string; actual: string; approver: string }> = [
    { campaignId: "cmp_g_core_phrases", type: "budget_increase", daysAgo: 21, from: 520, to: 630, reason: "Pipeline ROAS 2.4× account average; cost per SQL 38% below benchmark.", expected: "Est. pipeline +$28K–$45K/month", actual: "Measured after 14 days: +$36K pipeline, cost per SQL flat (−2%).", approver: "Marketing Manager" },
    { campaignId: "cmp_l_vp_enterprise", type: "budget_increase", daysAgo: 18, from: 600, to: 680, reason: "Lowest CTR in the account but highest pipeline per dollar (enterprise VP buyers).", expected: "Est. pipeline +$40K–$70K/month", actual: "Measured after 14 days: +$62K pipeline from 1 new enterprise opportunity.", approver: "Marketing Manager" },
    { campaignId: "cmp_m_video_views", type: "budget_decrease", daysAgo: 16, from: 260, to: 225, reason: "High CTR (6.3%) but 1.5% lead→SQL; leads outside ICP.", expected: "Est. waste avoided $900/month", actual: "Measured: spend −$1,050; SQLs unchanged (0 → 0).", approver: "Marketing Manager" },
    { campaignId: "cmp_g_pmax", type: "rotate_creative", daysAgo: 12, from: 300, to: 270, reason: "Fatigue score 64/100: CTR −31% vs baseline, CPC +22%.", expected: "Stabilize CTR; est. waste avoided $540/month", actual: "Measured: CTR recovered +18% after rotation; spend restored on day 9.", approver: "Growth Lead" },
    { campaignId: "cmp_l_detailers", type: "budget_decrease", daysAgo: 9, from: 250, to: 210, reason: "Bottom 30% on pipeline quality: 3.9× pipeline ROAS vs 11.7× average.", expected: "Est. waste avoided $800/month", actual: "Too early to measure (measurement window: 14 days).", approver: "Marketing Manager" },
    { campaignId: "cmp_l_chief_estimators", type: "budget_increase", daysAgo: 6, from: 500, to: 570, reason: "Top-3 campaign: 31× pipeline ROAS, 16 SQLs in 30 days.", expected: "Est. pipeline +$30K–$55K/month", actual: "Too early to measure.", approver: "Marketing Manager" },
    { campaignId: "cmp_m_metalcon", type: "pause_campaign", daysAgo: 4, from: 120, to: 0, reason: "0 SQLs from $3K+ spend; trade-show audience exhausted.", expected: "Est. waste avoided $3,600/month", actual: "", approver: "Growth Lead" },
    { campaignId: "cmp_g_structural_est", type: "investigate", daysAgo: 2, from: 360, to: 360, reason: "Spend spike +58% vs expected with no conversion lift.", expected: "No change; investigate bid strategy", actual: "", approver: "Marketing Manager" },
  ];

  const actions: OptimizationAction[] = seeds.map((s, i) => {
    const c = byId.get(s.campaignId);
    const created = addDays(end, -s.daysAgo);
    const executed = new Date(created.getTime() + (2 + rng.int(0, 5)) * 3600_000);
    const measured = s.actual && !s.actual.startsWith("Too early") ? addDays(executed, 14) : undefined;
    const status: OptimizationAction["status"] = s.type === "investigate" ? "approved" : s.daysAgo <= 4 ? "executed" : measured ? "measured" : "executed";
    return {
      id: `act_demo_${i + 1}`,
      organizationId: org,
      recommendationId: `rec_demo_${i + 1}`,
      platform: c?.platform ?? "google",
      campaignId: s.campaignId,
      campaignName: c?.name ?? s.campaignId,
      actionType: s.type,
      before: s.type === "pause_campaign" ? "Active" : s.type === "investigate" ? "—" : `$${s.from}/day`,
      after: s.type === "pause_campaign" ? "Paused" : s.type === "investigate" ? "Flagged for review" : `$${s.to}/day`,
      reason: s.reason,
      expectedImpact: s.expected,
      actualImpact: s.actual || undefined,
      approver: s.approver,
      status,
      createdAt: created.toISOString(),
      executedAt: status === "approved" ? undefined : executed.toISOString(),
      measuredAt: measured?.toISOString(),
    };
  });

  // Scan runs are anchored to "now" so the topbar shows a recent last scan and a future next scan.
  const scanRuns: ScanRun[] = [];
  const nowMs = Date.now();
  const lastHour = nowMs - (nowMs % 3600_000);
  for (let i = 0; i < 24; i++) {
    const started = new Date(lastHour - i * 3600_000 + rng.int(60, 240) * 1000);
    const finished = new Date(started.getTime() + (35 + rng.int(0, 40)) * 1000);
    const issues = 12 + rng.int(0, 9);
    scanRuns.push({
      id: `scan_demo_${i + 1}`,
      organizationId: org,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      platformsScanned: ["google", "meta", "linkedin"],
      campaignsScanned: ds.campaigns.filter((c) => c.status === "active").length,
      issuesDetected: issues,
      recommendationsCreated: issues + 20 + rng.int(0, 6),
      actionsExecuted: rng.int(0, 3),
      errors: i === 7 ? ["Meta Marketing API: rate limit (retried after 60s)"] : [],
      status: i === 7 ? "partial" : "completed",
    });
  }

  const briefs: DailyBrief[] = [];
  for (let i = 0; i < 3; i++) {
    const date = toISODate(addDays(end, -i));
    briefs.push({
      id: `brief_demo_${i + 1}`,
      organizationId: org,
      date,
      subject: `AdPilot Daily Brief — ${date}`,
      summaryMarkdown: `Demo brief for ${date}. Generate a fresh brief from the AI Agent page.`,
      emailHtml: "",
      createdAt: new Date(`${date}T13:00:00.000Z`).toISOString(),
    });
  }

  return { actions, scanRuns, briefs };
}

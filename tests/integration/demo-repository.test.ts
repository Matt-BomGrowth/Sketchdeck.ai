import { describe, it, expect, beforeAll } from "vitest";
import { DemoRepository } from "@/lib/data/demo-repository";
import { buildSnapshot } from "@/lib/analytics/snapshot";
import type { DataRepository } from "@/lib/data/repository";
import type { Recommendation } from "@/types/domain";

process.env.DEMO_ANCHOR_DATE = "2026-09-13";

const repo: DataRepository = new DemoRepository();
let recs: Recommendation[] = [];

beforeAll(async () => {
  const [org, campaigns, creatives, audienceSegments, end] = await Promise.all([
    repo.getOrganization(),
    repo.getCampaigns(),
    repo.getCreatives(),
    repo.getAudienceSegments({ start: "2026-06-16", end: "2026-09-13" }),
    repo.getLatestDate(),
  ]);
  const dailyMetrics = await repo.getDailyMetrics({ start: "2026-05-17", end });
  const creativeDailyMetrics = await repo.getCreativeDailyMetrics({ start: "2026-05-17", end });
  const snap = buildSnapshot({ organization: org, campaigns, dailyMetrics, creatives, creativeDailyMetrics, audienceSegments, endDate: end, windowDays: 30 });
  recs = snap.recommendations;
});

describe("DemoRepository", () => {
  it("is in demo mode and returns campaigns and the anchored latest date", async () => {
    expect(repo.mode).toBe("demo");
    expect(await repo.getLatestDate()).toBe("2026-09-13");
    const campaigns = await repo.getCampaigns();
    expect(campaigns.length).toBeGreaterThanOrEqual(20);
    expect((await repo.getOrganization()).slug).toBe("sketchdeck");
  });

  it("filters daily metrics by range", async () => {
    const rows = await repo.getDailyMetrics({ start: "2026-09-10", end: "2026-09-13" });
    expect(rows.length).toBe((await repo.getCampaigns()).length * 4);
    expect(rows.every((r) => r.date >= "2026-09-10" && r.date <= "2026-09-13")).toBe(true);
  });

  it("seeds demo history (actions, scan runs, briefs) and integration statuses", async () => {
    const actions = await repo.getActions();
    expect(actions.length).toBeGreaterThan(0);
    expect((await repo.getScanRuns(5)).length).toBeLessThanOrEqual(5);
    expect((await repo.getDailyBriefs()).length).toBeGreaterThan(0);
    const statuses = await repo.getIntegrationStatuses();
    expect(statuses.length).toBe(7);
    expect(statuses.every((s) => s.health === "demo")).toBe(true);
  });

  it("saves recommendations and approving one creates a visible action", async () => {
    expect(recs.length).toBeGreaterThan(0);
    await repo.saveRecommendations(recs);
    const stored = await repo.getRecommendations();
    expect(stored.length).toBe(recs.length);

    const target = recs.find((r) => r.type === "budget_increase")!;
    const before = (await repo.getActions()).length;
    const result = await repo.decideRecommendation(target.id, { decision: "approve", approver: "matt@bomgrowth.com", note: "ship it" });
    expect(result.recommendation.status).toBe("approved");
    expect(result.action).toBeDefined();
    const actions = await repo.getActions();
    expect(actions.length).toBe(before + 1);
    expect(actions[0].id).toBe(result.action!.id);
    expect(actions[0].recommendationId).toBe(target.id);
    expect(actions[0].status).toBe("approved");
    // Campaign name is resolved from the dataset, not the recommendation title.
    const campaign = (await repo.getCampaigns()).find((c) => c.id === target.campaignId)!;
    expect(actions[0].campaignName).toBe(campaign.name);
    expect((await repo.getRecommendations()).find((r) => r.id === target.id)!.status).toBe("approved");
  });

  it("preserves decisions on re-save of identical recommendations", async () => {
    const target = recs.find((r) => r.type === "budget_increase")!;
    await repo.saveRecommendations(recs);
    expect((await repo.getRecommendations()).find((r) => r.id === target.id)!.status).toBe("approved");
  });

  it("rejecting a recommendation creates no action", async () => {
    const target = recs.find((r) => r.type === "budget_decrease")!;
    const before = (await repo.getActions()).length;
    const result = await repo.decideRecommendation(target.id, { decision: "reject", approver: "matt@bomgrowth.com" });
    expect(result.recommendation.status).toBe("rejected");
    expect(result.action).toBeUndefined();
    expect((await repo.getActions()).length).toBe(before);
  });

  it("modifying a budget recommendation records the new target", async () => {
    const target = recs.filter((r) => r.type === "budget_increase")[1];
    expect(target).toBeDefined();
    const result = await repo.decideRecommendation(target.id, { decision: "modify", approver: "matt@bomgrowth.com", modifiedBudgetTo: target.budgetChange!.from + 1 });
    expect(result.recommendation.status).toBe("modified");
    expect(result.recommendation.budgetChange!.to).toBe(target.budgetChange!.from + 1);
    expect(result.action!.after).toBe(`$${target.budgetChange!.from + 1}/day`);
  });

  it("deciding twice throws", async () => {
    const target = recs.find((r) => r.type === "budget_increase")!;
    await expect(repo.decideRecommendation(target.id, { decision: "approve", approver: "matt" })).rejects.toThrow(/only pending recommendations can be decided/);
    const rejected = recs.find((r) => r.type === "budget_decrease")!;
    await expect(repo.decideRecommendation(rejected.id, { decision: "reject", approver: "matt" })).rejects.toThrow(/is rejected/);
  });

  it("throws for an unknown recommendation id", async () => {
    await expect(repo.decideRecommendation("rec_does_not_exist", { decision: "approve", approver: "matt" })).rejects.toThrow(/not found/);
  });

  it("saveAction upserts by id", async () => {
    const actions = await repo.getActions();
    const first = actions[0];
    await repo.saveAction({ ...first, status: "executed", executedAt: new Date().toISOString() });
    const after = await repo.getActions();
    expect(after.length).toBe(actions.length);
    expect(after.find((a) => a.id === first.id)!.status).toBe("executed");
  });

  it("round-trips settings", async () => {
    const settings = await repo.getSettings();
    expect(settings.automationPolicy.autoExecuteEnabled).toBe(false);
    await repo.saveSettings({ ...settings, automationPolicy: { ...settings.automationPolicy, maxBudgetChangePct: 0.2 } });
    expect((await repo.getSettings()).automationPolicy.maxBudgetChangePct).toBe(0.2);
  });
});

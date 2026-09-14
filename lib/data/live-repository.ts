import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AudienceSegmentMetric,
  Campaign,
  Creative,
  CreativeDailyMetric,
  DailyBrief,
  DailyMetric,
  IntegrationStatus,
  OptimizationAction,
  Organization,
  Recommendation,
  ScanRun,
} from "@/types/domain";
import type { DataRepository, DateRangeQuery, OrgSettings } from "./repository";
import { DEFAULT_FATIGUE_THRESHOLDS } from "@/agent/detectors/fatigue";
import { DEFAULT_AUTOMATION_POLICY } from "@/agent/actions/policy";
import { applyDecision, type DecisionInput } from "@/agent/actions/approval-workflow";
import type { NormalizedCampaign, NormalizedCampaignMetric, NormalizedCreative, NormalizedCreativeMetric } from "@/integrations/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

/**
 * Supabase-backed repository for LIVE mode. Tables are populated by the
 * hourly scan (NotFair → normalized rows) and CRM sync. All queries are
 * organization-scoped; RLS enforces isolation for user sessions.
 */
export class LiveRepository implements DataRepository {
  readonly mode = "live" as const;

  constructor(
    private readonly db: SupabaseClient,
    private readonly organizationId: string,
    private readonly actor: string = "system",
  ) {}

  private async one<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T | null> {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data;
  }

  private async many<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async getOrganization(): Promise<Organization> {
    const r = await this.one<Row>(this.db.from("organizations").select("*").eq("id", this.organizationId).single());
    if (!r) throw new Error("Organization not found");
    return { id: r.id, name: r.name, slug: r.slug, currency: r.currency, timezone: r.timezone };
  }

  async getSettings(): Promise<OrgSettings> {
    const r = await this.one<Row>(this.db.from("org_settings").select("*").eq("organization_id", this.organizationId).maybeSingle());
    return {
      fatigueThresholds: { ...DEFAULT_FATIGUE_THRESHOLDS, ...(r?.fatigue_thresholds ?? {}) },
      automationPolicy: { ...DEFAULT_AUTOMATION_POLICY, ...(r?.automation_policy ?? {}) },
    };
  }

  async saveSettings(settings: OrgSettings) {
    const { error } = await this.db.from("org_settings").upsert({
      organization_id: this.organizationId,
      fatigue_thresholds: settings.fatigueThresholds,
      automation_policy: settings.automationPolicy,
    });
    if (error) throw new Error(error.message);
    await this.audit(this.actor, "settings.update", "org_settings", this.organizationId, settings as unknown as Record<string, unknown>);
  }

  async getLatestDate(): Promise<string> {
    const r = await this.one<Row>(
      this.db.from("performance_metrics").select("date").eq("organization_id", this.organizationId).eq("entity_type", "campaign").order("date", { ascending: false }).limit(1).maybeSingle(),
    );
    if (r?.date) return String(r.date);
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  async getCampaigns(): Promise<Campaign[]> {
    const rows = await this.many<Row>(this.db.from("campaigns").select("*").eq("organization_id", this.organizationId).order("name"));
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      platform: r.platform,
      externalId: r.external_id,
      name: r.name,
      status: r.status,
      objective: r.objective,
      dailyBudget: Number(r.daily_budget),
      currency: r.currency,
      country: r.country ?? "",
      industry: r.industry ?? "",
      icpSegment: r.icp_segment ?? "",
      channelType: r.channel_type ?? "",
      startedAt: r.started_at ?? r.created_at,
    }));
  }

  private async metrics(entityType: "campaign" | "creative", range: DateRangeQuery): Promise<Row[]> {
    return this.many<Row>(
      this.db
        .from("performance_metrics")
        .select("*")
        .eq("organization_id", this.organizationId)
        .eq("entity_type", entityType)
        .gte("date", range.start)
        .lte("date", range.end)
        .order("date"),
    );
  }

  async getDailyMetrics(range: DateRangeQuery): Promise<DailyMetric[]> {
    const rows = await this.metrics("campaign", range);
    return rows.map((r) => ({ campaignId: r.entity_id, ...mapMetric(r) }));
  }

  async getCreatives(): Promise<Creative[]> {
    const rows = await this.many<Row>(this.db.from("creatives").select("*").eq("organization_id", this.organizationId));
    return rows.map((r) => ({
      id: r.id,
      campaignId: r.campaign_id,
      adGroupId: r.ad_group_id ?? undefined,
      platform: r.platform,
      externalId: r.external_id,
      name: r.name,
      type: r.type,
      status: r.status,
      headline: r.headline ?? "",
      primaryText: r.primary_text ?? "",
      description: r.description ?? undefined,
      cta: r.cta ?? undefined,
      landingUrl: r.landing_url ?? undefined,
      assetStatus: r.asset_status,
      assetUrl: r.asset_url ?? undefined,
      previewUrl: r.preview_url ?? undefined,
      thumbnailUrl: r.thumbnail_url ?? undefined,
      width: r.width ?? undefined,
      height: r.height ?? undefined,
      testGroup: r.test_group ?? undefined,
      variant: r.variant ?? undefined,
    }));
  }

  async getCreativeDailyMetrics(range: DateRangeQuery): Promise<CreativeDailyMetric[]> {
    const rows = await this.metrics("creative", range);
    return rows.map((r) => ({ creativeId: r.entity_id, ...mapMetric(r) }));
  }

  async getAudienceSegments(range: DateRangeQuery): Promise<AudienceSegmentMetric[]> {
    const rows = await this.many<Row>(
      this.db.from("audience_segment_metrics").select("*").eq("organization_id", this.organizationId).lte("window_start", range.end).gte("window_end", range.start),
    );
    return rows.map((r) => ({
      dimension: r.dimension,
      value: r.value,
      spend: Number(r.spend),
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      leads: r.leads,
      mqls: r.mqls,
      sqls: r.sqls,
      opportunities: r.opportunities,
      pipeline: Number(r.pipeline),
      revenue: Number(r.revenue),
    }));
  }

  async getRecommendations(): Promise<Recommendation[]> {
    const rows = await this.many<Row>(this.db.from("ai_recommendations").select("*").eq("organization_id", this.organizationId).order("created_at", { ascending: false }).limit(200));
    return rows.map(mapRecommendation);
  }

  async saveRecommendations(recs: Recommendation[]) {
    if (recs.length === 0) return;
    const rows = recs.map((r) => ({
      organization_id: this.organizationId,
      scan_run_id: r.scanRunId ?? null,
      campaign_id: r.campaignId ?? null,
      creative_id: r.creativeId ?? null,
      platform: r.platform ?? null,
      type: r.type,
      priority: r.priority,
      title: r.title,
      what_happened: r.whatHappened,
      why: r.why,
      recommended_action: r.recommendedAction,
      expected_impact: r.expectedImpact,
      confidence: r.confidence,
      status: r.status,
      budget_change: r.budgetChange ?? null,
      requires_approval: r.requiresApproval,
      dedupe_key: `${r.type}:${r.campaignId ?? r.creativeId ?? "org"}`,
    }));
    // Pending duplicates are ignored (unique partial index on dedupe_key).
    const { error } = await this.db.from("ai_recommendations").upsert(rows, { onConflict: "organization_id,dedupe_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  async decideRecommendation(id: string, input: DecisionInput) {
    const row = await this.one<Row>(this.db.from("ai_recommendations").select("*").eq("id", id).eq("organization_id", this.organizationId).single());
    if (!row) throw new Error("Recommendation not found");
    const result = applyDecision(mapRecommendation(row), input);
    const { error } = await this.db
      .from("ai_recommendations")
      .update({ status: result.recommendation.status, budget_change: result.recommendation.budgetChange ?? null, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    if (result.action) {
      const campaign = await this.one<Row>(this.db.from("campaigns").select("name").eq("id", result.action.campaignId).maybeSingle());
      result.action.campaignName = campaign?.name ?? result.action.campaignName;
      const ins = await this.one<Row>(
        this.db
          .from("optimization_actions")
          .insert({
            organization_id: this.organizationId,
            recommendation_id: id,
            platform: result.action.platform,
            campaign_id: result.action.campaignId || null,
            campaign_name: result.action.campaignName,
            action_type: result.action.actionType,
            before_value: result.action.before,
            after_value: result.action.after,
            reason: result.action.reason,
            expected_impact: result.action.expectedImpact,
            approver: result.action.approver,
            status: result.action.status,
          })
          .select("id")
          .single(),
      );
      if (ins?.id) result.action.id = ins.id;
    }
    await this.audit(input.approver, `recommendation.${input.decision}`, "recommendation", id, { note: input.note });
    return result;
  }

  async getActions(): Promise<OptimizationAction[]> {
    const rows = await this.many<Row>(this.db.from("optimization_actions").select("*").eq("organization_id", this.organizationId).order("created_at", { ascending: false }).limit(200));
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      recommendationId: r.recommendation_id ?? undefined,
      platform: r.platform,
      campaignId: r.campaign_id ?? "",
      campaignName: r.campaign_name,
      actionType: r.action_type,
      before: r.before_value,
      after: r.after_value,
      reason: r.reason,
      expectedImpact: r.expected_impact,
      actualImpact: r.actual_impact ?? undefined,
      approver: r.approver ?? undefined,
      status: r.status,
      createdAt: r.created_at,
      executedAt: r.executed_at ?? undefined,
      measuredAt: r.measured_at ?? undefined,
    }));
  }

  async saveAction(action: OptimizationAction) {
    const { error } = await this.db
      .from("optimization_actions")
      .update({ status: action.status, after_value: action.after, actual_impact: action.actualImpact ?? null, executed_at: action.executedAt ?? null, measured_at: action.measuredAt ?? null })
      .eq("id", action.id)
      .eq("organization_id", this.organizationId);
    if (error) throw new Error(error.message);
  }

  async getScanRuns(limit = 20): Promise<ScanRun[]> {
    const rows = await this.many<Row>(this.db.from("scan_runs").select("*").eq("organization_id", this.organizationId).order("started_at", { ascending: false }).limit(limit));
    return rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? undefined,
      platformsScanned: r.platforms_scanned ?? [],
      campaignsScanned: r.campaigns_scanned,
      issuesDetected: r.issues_detected,
      recommendationsCreated: r.recommendations_created,
      actionsExecuted: r.actions_executed,
      errors: r.errors ?? [],
      status: r.status,
    }));
  }

  async saveScanRun(run: ScanRun) {
    const { error } = await this.db.from("scan_runs").upsert({
      id: run.id,
      organization_id: this.organizationId,
      started_at: run.startedAt,
      finished_at: run.finishedAt ?? null,
      platforms_scanned: run.platformsScanned,
      campaigns_scanned: run.campaignsScanned,
      issues_detected: run.issuesDetected,
      recommendations_created: run.recommendationsCreated,
      actions_executed: run.actionsExecuted,
      errors: run.errors,
      status: run.status,
    });
    if (error) throw new Error(error.message);
  }

  async getDailyBriefs(limit = 7): Promise<DailyBrief[]> {
    const rows = await this.many<Row>(this.db.from("daily_briefs").select("*").eq("organization_id", this.organizationId).order("date", { ascending: false }).limit(limit));
    return rows.map((r) => ({ id: r.id, organizationId: r.organization_id, date: r.date, subject: r.subject, summaryMarkdown: r.summary_markdown, emailHtml: r.email_html, createdAt: r.created_at }));
  }

  async saveDailyBrief(brief: DailyBrief) {
    const { error } = await this.db
      .from("daily_briefs")
      .upsert({ organization_id: this.organizationId, date: brief.date, subject: brief.subject, summary_markdown: brief.summaryMarkdown, email_html: brief.emailHtml }, { onConflict: "organization_id,date" });
    if (error) throw new Error(error.message);
  }

  async getIntegrationStatuses(): Promise<IntegrationStatus[]> {
    const rows = await this.many<Row>(this.db.from("integrations").select("*").eq("organization_id", this.organizationId));
    return rows.map((r) => ({ key: r.key, name: r.name, health: r.health, detail: r.detail ?? "", lastSyncAt: r.last_sync_at ?? undefined }));
  }

  async saveIntegrationStatus(status: IntegrationStatus) {
    const { error } = await this.db.from("integrations").upsert(
      { organization_id: this.organizationId, key: status.key, name: status.name, health: status.health, detail: status.detail, last_sync_at: status.lastSyncAt ?? null, last_error: status.health === "connection_issue" ? status.detail : null },
      { onConflict: "organization_id,key" },
    );
    if (error) throw new Error(error.message);
  }

  async upsertCampaigns(rows: NormalizedCampaign[], source: string) {
    const ids = new Map<string, string>();
    if (rows.length === 0) return ids;
    const payload = rows.map((r) => ({
      organization_id: this.organizationId,
      platform: r.platform,
      external_id: r.externalId,
      name: r.name,
      status: r.status,
      objective: r.objective,
      daily_budget: r.dailyBudget,
      currency: r.currency,
      channel_type: r.channelType,
      source,
      raw: r.raw ?? null,
    }));
    const data = await this.many<Row>(this.db.from("campaigns").upsert(payload, { onConflict: "organization_id,platform,external_id" }).select("id, external_id, platform"));
    for (const d of data) ids.set(`${d.platform}:${d.external_id}`, d.id);
    return ids;
  }

  async upsertDailyMetrics(rows: NormalizedCampaignMetric[], campaignIds: Map<string, string>, source: string) {
    const payload = rows
      .map((r) => {
        const id = campaignIds.get(`google:${r.externalCampaignId}`) ?? campaignIds.get(`meta:${r.externalCampaignId}`) ?? campaignIds.get(`linkedin:${r.externalCampaignId}`) ?? campaignIds.get(r.externalCampaignId);
        if (!id) return null;
        return {
          organization_id: this.organizationId,
          entity_type: "campaign",
          entity_id: id,
          date: r.date,
          spend: r.spend,
          impressions: r.impressions,
          clicks: r.clicks,
          leads: r.leads,
          mqls: r.mqls,
          sqls: r.sqls,
          opportunities: r.opportunities,
          pipeline: r.pipeline,
          revenue: r.revenue,
          frequency: r.frequency ?? null,
          platform_conversions: r.platformConversions ?? null,
          platform_conversion_value: r.platformConversionValue ?? null,
          source,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await this.db.from("performance_metrics").upsert(payload.slice(i, i + 500), { onConflict: "entity_type,entity_id,date" });
      if (error) throw new Error(error.message);
    }
    return payload.length;
  }

  async upsertCreatives(rows: NormalizedCreative[], campaignIds: Map<string, string>, source: string) {
    const ids = new Map<string, string>();
    const payload = rows
      .map((r) => {
        const campaignId = campaignIds.get(`${r.platform}:${r.externalCampaignId}`);
        if (!campaignId) return null;
        return {
          organization_id: this.organizationId,
          campaign_id: campaignId,
          platform: r.platform,
          external_id: r.externalId,
          name: r.name,
          type: r.type,
          status: r.status,
          headline: r.headline,
          primary_text: r.primaryText,
          description: r.description ?? null,
          cta: r.cta ?? null,
          landing_url: r.landingUrl ?? null,
          asset_status: r.assetStatus,
          asset_id: r.assetId ?? null,
          asset_url: r.assetUrl ?? null,
          preview_url: r.previewUrl ?? null,
          thumbnail_url: r.thumbnailUrl ?? null,
          width: r.width ?? null,
          height: r.height ?? null,
          raw: r.raw ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (payload.length === 0) return ids;
    void source;
    const data = await this.many<Row>(this.db.from("creatives").upsert(payload, { onConflict: "organization_id,platform,external_id" }).select("id, external_id, platform"));
    for (const d of data) ids.set(`${d.platform}:${d.external_id}`, d.id);
    return ids;
  }

  async upsertCreativeDailyMetrics(rows: NormalizedCreativeMetric[], creativeIds: Map<string, string>, source: string) {
    const payload = rows
      .map((r) => {
        const id = creativeIds.get(`google:${r.externalCreativeId}`) ?? creativeIds.get(`meta:${r.externalCreativeId}`) ?? creativeIds.get(`linkedin:${r.externalCreativeId}`);
        if (!id) return null;
        return { organization_id: this.organizationId, entity_type: "creative", entity_id: id, date: r.date, spend: r.spend, impressions: r.impressions, clicks: r.clicks, leads: r.leads, mqls: r.mqls, sqls: r.sqls, opportunities: r.opportunities, pipeline: r.pipeline, revenue: r.revenue, frequency: r.frequency ?? null, source };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await this.db.from("performance_metrics").upsert(payload.slice(i, i + 500), { onConflict: "entity_type,entity_id,date" });
      if (error) throw new Error(error.message);
    }
    return payload.length;
  }

  async audit(actor: string, action: string, entityType: string, entityId?: string, details: Record<string, unknown> = {}) {
    await this.db.from("audit_logs").insert({ organization_id: this.organizationId, actor, action, entity_type: entityType, entity_id: entityId ?? null, details });
  }
}

function mapMetric(r: Row) {
  return {
    date: String(r.date),
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    leads: r.leads ?? 0,
    mqls: r.mqls ?? 0,
    sqls: r.sqls ?? 0,
    opportunities: r.opportunities ?? 0,
    pipeline: Number(r.pipeline ?? 0),
    revenue: Number(r.revenue ?? 0),
    frequency: r.frequency === null || r.frequency === undefined ? undefined : Number(r.frequency),
  };
}

function mapRecommendation(r: Row): Recommendation {
  return {
    id: r.id,
    organizationId: r.organization_id,
    campaignId: r.campaign_id ?? undefined,
    creativeId: r.creative_id ?? undefined,
    platform: r.platform ?? undefined,
    type: r.type,
    priority: r.priority,
    title: r.title,
    whatHappened: r.what_happened,
    why: r.why,
    recommendedAction: r.recommended_action,
    expectedImpact: r.expected_impact ?? { pipelineLow: 0, pipelineHigh: 0 },
    confidence: Number(r.confidence),
    status: r.status,
    budgetChange: r.budget_change ?? undefined,
    requiresApproval: r.requires_approval,
    createdAt: r.created_at,
    scanRunId: r.scan_run_id ?? undefined,
  };
}

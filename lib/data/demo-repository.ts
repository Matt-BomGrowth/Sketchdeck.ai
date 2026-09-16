import type { AuditLog, DailyBrief, IntegrationStatus, OptimizationAction, Recommendation, ScanRun } from "@/types/domain";
import type { DataRepository, DateRangeQuery, OrgSettings } from "./repository";
import { getDemoDataset } from "@/data/demo";
import { DEFAULT_FATIGUE_THRESHOLDS } from "@/agent/detectors/fatigue";
import { DEFAULT_AUTOMATION_POLICY } from "@/agent/actions/policy";
import { applyDecision, type DecisionInput } from "@/agent/actions/approval-workflow";
import { newId } from "@/lib/utils/id";
import { buildDemoHistory } from "@/data/demo/history";
import { buildDemoChannelDetail, type DemoChannelDetail } from "@/data/demo/channel-detail";

/**
 * In-memory demo repository. State (approvals, settings) persists for the
 * lifetime of the server process — enough to demonstrate the full
 * OBSERVE → RECOMMEND → APPROVE → EXECUTE → MEASURE loop without a database.
 */
class DemoState {
  settings: OrgSettings = { fatigueThresholds: { ...DEFAULT_FATIGUE_THRESHOLDS }, automationPolicy: { ...DEFAULT_AUTOMATION_POLICY } };
  recommendations = new Map<string, Recommendation>();
  actions: OptimizationAction[] = [];
  scanRuns: ScanRun[] = [];
  briefs: DailyBrief[] = [];
  audit: AuditLog[] = [];
  seeded = false;
  channelDetail = new Map<string, DemoChannelDetail>();
}

function channelDetail(): DemoChannelDetail {
  const ds = getDemoDataset();
  const s = state();
  let detail = s.channelDetail.get(ds.endDate);
  if (!detail) {
    detail = buildDemoChannelDetail(ds);
    s.channelDetail.set(ds.endDate, detail);
  }
  return detail;
}

function inRange<T extends { date: string }>(rows: T[], range: DateRangeQuery) {
  return rows.filter((r) => r.date >= range.start && r.date <= range.end);
}

const globalKey = "__adpilot_demo_state__";
function state(): DemoState {
  const g = globalThis as unknown as Record<string, DemoState | undefined>;
  if (!g[globalKey]) g[globalKey] = new DemoState();
  return g[globalKey]!;
}

function ensureSeeded() {
  const s = state();
  if (s.seeded) return s;
  const ds = getDemoDataset();
  const history = buildDemoHistory(ds);
  s.actions = history.actions;
  s.scanRuns = history.scanRuns;
  s.briefs = history.briefs;
  s.seeded = true;
  return s;
}

export class DemoRepository implements DataRepository {
  readonly mode = "demo" as const;

  async getOrganization() {
    return getDemoDataset().organization;
  }
  async getSettings() {
    return ensureSeeded().settings;
  }
  async saveSettings(settings: OrgSettings) {
    ensureSeeded().settings = settings;
  }
  async getLatestDate() {
    return getDemoDataset().endDate;
  }
  async getCampaigns() {
    return getDemoDataset().campaigns;
  }
  async getDailyMetrics(range: DateRangeQuery) {
    return getDemoDataset().dailyMetrics.filter((m) => m.date >= range.start && m.date <= range.end);
  }
  async getCreatives() {
    return getDemoDataset().creatives;
  }
  async getCreativeDailyMetrics(range: DateRangeQuery) {
    return getDemoDataset().creativeDailyMetrics.filter((m) => m.date >= range.start && m.date <= range.end);
  }
  async getAudienceSegments() {
    return getDemoDataset().audienceSegments;
  }
  async getKeywordDailyMetrics(range: DateRangeQuery) {
    return inRange(channelDetail().keywords, range);
  }
  async getSearchTermDailyMetrics(range: DateRangeQuery) {
    return inRange(channelDetail().searchTerms, range);
  }
  async getGa4Daily(range: DateRangeQuery) {
    return inRange(channelDetail().ga4, range);
  }
  async getSearchConsoleDaily(range: DateRangeQuery) {
    return inRange(channelDetail().searchConsole, range);
  }
  async getCrmFunnelDaily(range: DateRangeQuery) {
    return inRange(channelDetail().crmFunnel, range);
  }
  async getRecommendations() {
    return [...ensureSeeded().recommendations.values()];
  }
  async saveRecommendations(recs: Recommendation[]) {
    const s = ensureSeeded();
    for (const r of recs) {
      // Preserve decisions already made on an identical recommendation.
      const existing = s.recommendations.get(r.id);
      if (existing && existing.status !== "pending") continue;
      s.recommendations.set(r.id, r);
    }
  }
  async decideRecommendation(id: string, input: DecisionInput) {
    const s = ensureSeeded();
    const rec = s.recommendations.get(id);
    if (!rec) throw new Error(`Recommendation ${id} not found`);
    const result = applyDecision(rec, input);
    s.recommendations.set(id, result.recommendation);
    if (result.action) {
      const campaign = getDemoDataset().campaigns.find((c) => c.id === result.action?.campaignId);
      result.action.campaignName = campaign?.name ?? result.action.campaignName;
      s.actions.unshift(result.action);
    }
    await this.audit(input.approver, `recommendation.${input.decision}`, "recommendation", id, { note: input.note });
    return result;
  }
  async getActions() {
    return ensureSeeded().actions;
  }
  async saveAction(action: OptimizationAction) {
    const s = ensureSeeded();
    const idx = s.actions.findIndex((a) => a.id === action.id);
    if (idx >= 0) s.actions[idx] = action;
    else s.actions.unshift(action);
  }
  async getScanRuns(limit = 20) {
    return ensureSeeded().scanRuns.slice(0, limit);
  }
  async saveScanRun(run: ScanRun) {
    const s = ensureSeeded();
    const idx = s.scanRuns.findIndex((r) => r.id === run.id);
    if (idx >= 0) s.scanRuns[idx] = run;
    else s.scanRuns.unshift(run);
  }
  async getDailyBriefs(limit = 7) {
    return ensureSeeded().briefs.slice(0, limit);
  }
  async saveDailyBrief(brief: DailyBrief) {
    ensureSeeded().briefs.unshift(brief);
  }
  async getIntegrationStatuses(): Promise<IntegrationStatus[]> {
    const ds = getDemoDataset();
    const at = new Date(`${ds.endDate}T23:00:00.000Z`).toISOString();
    return [
      {
        key: "notfair",
        name: "NotFair MCP",
        health: "demo",
        detail: "Demo mode — Google Ads + GA4 capability inventory verified; live sync disabled.",
        lastSyncAt: at,
      },
      { key: "google_ads", name: "Google Ads", health: "demo", detail: "Demo data (via NotFair in live mode).", lastSyncAt: at },
      { key: "meta", name: "Meta Ads", health: "demo", detail: "Demo data. Marketing API credentials not configured.", lastSyncAt: at },
      { key: "linkedin", name: "LinkedIn Ads", health: "demo", detail: "Demo data. LinkedIn Marketing API credentials not configured.", lastSyncAt: at },
      {
        key: "hubspot",
        name: "HubSpot CRM",
        health: "demo",
        detail: process.env.HUBSPOT_ACCESS_TOKEN
          ? "Demo funnel shown. HubSpot Service Key is configured — run /api/integrations/hubspot/verify to check the portal."
          : "Demo funnel (MQL/SQL/opportunity) generated locally.",
        lastSyncAt: at,
      },
      { key: "ga4", name: "Google Analytics 4", health: "demo", detail: "Demo mode (via NotFair in live mode).", lastSyncAt: at },
      { key: "search_console", name: "Search Console", health: "demo", detail: "Demo mode (via NotFair in live mode).", lastSyncAt: at },
    ];
  }
  async saveIntegrationStatus() {
    /* demo: integration statuses are static */
  }
  async upsertCampaigns() {
    return new Map<string, string>();
  }
  async upsertDailyMetrics() {
    return 0;
  }
  async upsertCreatives() {
    return new Map<string, string>();
  }
  async upsertCreativeDailyMetrics() {
    return 0;
  }
  async applyFunnelAttribution() {
    return 0;
  }
  async upsertKeywordDailyMetrics() {
    return 0;
  }
  async upsertSearchTermDailyMetrics() {
    return 0;
  }
  async upsertGa4Daily() {
    return 0;
  }
  async upsertSearchConsoleDaily() {
    return 0;
  }
  async upsertCrmFunnelDaily() {
    return 0;
  }
  async audit(actor: string, action: string, entityType: string, entityId?: string, details: Record<string, unknown> = {}) {
    ensureSeeded().audit.unshift({
      id: newId("aud"),
      organizationId: getDemoDataset().organization.id,
      actor,
      action,
      entityType,
      entityId,
      details,
      createdAt: new Date().toISOString(),
    });
  }
}

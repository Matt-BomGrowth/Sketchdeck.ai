/**
 * Secondary intelligence: market trends, search opportunities, competitor
 * messaging, keyword opportunities, industry signals and content
 * opportunities. These modules never fabricate measured data — each declares
 * its data source and reports `unavailable` when the source is not connected.
 * Illustrative content is labeled as such.
 */

import type { AnalysisSnapshot } from "@/lib/analytics/snapshot";
import type { IntegrationStatus } from "@/types/domain";
import { SKETCHDECK } from "@/data/demo/sketchdeck";
import { fmtCurrency, fmtMultiple } from "@/lib/utils/format";

export interface InsightModule {
  key: string;
  title: string;
  source: string;
  status: "measured" | "illustrative" | "unavailable";
  note: string;
  items: Array<{ title: string; detail: string; label?: "Measured" | "Estimated" | "Illustrative" }>;
}

export function buildInsightModules(s: AnalysisSnapshot, integrations: IntegrationStatus[]): InsightModule[] {
  const sc = integrations.find((i) => i.key === "search_console");
  const scConnected = sc?.health === "connected";
  const competitorCampaign = s.campaigns.find((c) => /compet/i.test(c.campaign.name));
  const byIndustry = s.icp.byDimension.industry ?? [];

  return [
    {
      key: "search_opportunities",
      title: "Search opportunities",
      source: "Google Search Console via NotFair",
      status: scConnected ? "measured" : "unavailable",
      note: scConnected ? "Queries with impressions but weak paid coverage." : `Search Console is not connected in the NotFair workspace${sc?.detail ? ` (${sc.detail})` : ""}. Connect it to surface queries SketchDeck ranks for organically that paid search does not cover.`,
      items: [],
    },
    {
      key: "keyword_opportunities",
      title: "Keyword opportunities",
      source: "Google Ads keyword ideas + search terms via NotFair",
      status: s.organization.id.includes("demo") ? "illustrative" : "unavailable",
      note: "Live mode reads search-term and keyword-idea reports through NotFair runScript/getKeywordIdeas. Demo shows the themes that SketchDeck's live RSAs already target.",
      items: [
        { title: "steel takeoff software", detail: "Core theme of the Core Phrases campaign (highest SQL volume).", label: "Illustrative" },
        { title: "structural steel estimating software", detail: "Ad group theme; strong intent from fabricators and estimators.", label: "Illustrative" },
        { title: "metal building estimating", detail: "Adjacent segment with its own campaign and ICP.", label: "Illustrative" },
        { title: "bluebeam alternative / stack takeoff alternative", detail: "Competitor-conquest theme; converts at the account's best cost per SQL.", label: "Illustrative" },
      ],
    },
    {
      key: "competitor_messaging",
      title: "Competitor messaging",
      source: "Manual research + competitor-conquest campaign performance",
      status: "illustrative",
      note: "Competitor spend, share of voice and traffic are NOT estimated — AdPilot never fabricates them. Messaging themes are illustrative research prompts; conquest performance below is measured from SketchDeck's own campaign.",
      items: [
        ...SKETCHDECK.competitors.map((c) => ({ title: c, detail: competitorTheme(c), label: "Illustrative" as const })),
        ...(competitorCampaign
          ? [{ title: `Conquest campaign: ${competitorCampaign.campaign.name}`, detail: `${fmtMultiple(competitorCampaign.metrics.pipelineRoas)} pipeline ROAS, ${competitorCampaign.totals.sqls} SQLs at ${fmtCurrency(competitorCampaign.metrics.costPerSql)} each (${s.window.label}).`, label: "Measured" as const }]
          : []),
      ],
    },
    {
      key: "industry_signals",
      title: "Industry signals",
      source: "ICP intelligence (CRM attribution)",
      status: "measured",
      note: "Which industries convert to pipeline right now.",
      items: byIndustry.slice(0, 5).map((r) => ({ title: r.value, detail: `${Math.round(r.pipelineShare * 100)}% of pipeline on ${Math.round(r.spendShare * 100)}% of spend · ${fmtMultiple(r.pipelineRoas)} pipeline ROAS`, label: "Measured" as const })),
    },
    {
      key: "market_trends",
      title: "Market trends",
      source: "Account-level trend (window vs. prior window)",
      status: "measured",
      note: "Directional signals from SketchDeck's own data; external market data is not connected.",
      items: [
        { title: "Pipeline momentum", detail: s.summary.sentences[0] ?? "—", label: "Measured" },
        { title: "Channel efficiency", detail: s.summary.sentences[1] ?? "—", label: "Measured" },
        { title: "Lead quality", detail: s.leadQuality.insights[0] ?? "—", label: "Measured" },
      ],
    },
    {
      key: "content_opportunities",
      title: "Content opportunities",
      source: "Creative → pipeline analysis",
      status: "measured",
      note: "Messaging angles that produce pipeline, worth extending into content.",
      items: [
        ...s.creatives.top.slice(0, 3).map((c) => ({ title: c.creative.headline, detail: `${c.creative.name} · ${fmtMultiple(c.metrics.pipelineRoas)} pipeline ROAS`, label: "Measured" as const })),
        ...s.creatives.insights.slice(0, 1).map((i) => ({ title: "Insight", detail: i, label: "Measured" as const })),
      ],
    },
  ];
}

function competitorTheme(name: string) {
  switch (name) {
    case "Tekla":
      return "BIM/detailing suite; messaging centers on model accuracy. Angle: LIFT works from PDFs before a model exists.";
    case "SDS/2":
      return "Steel detailing and connection design. Angle: estimating speed at bid stage, not detailing.";
    case "Procore":
      return "Construction management platform. Angle: LIFT is estimator-first, integrates into existing workflows.";
    case "Autodesk":
      return "Broad design ecosystem. Angle: purpose-built steel takeoffs vs. general tools.";
    case "PlanGrid":
      return "Field document management. Angle: preconstruction takeoff automation.";
    case "Bluebeam":
      return "Manual PDF markup/takeoff. Angle: replace highlighter takeoffs with AI counts.";
    case "STACK":
      return "Cloud takeoff for GCs/subs. Angle: structural-steel specificity and BOM output.";
    default:
      return "";
  }
}

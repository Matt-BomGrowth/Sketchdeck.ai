import type { Campaign, CampaignObjective, CampaignStatus, PerformanceProfile, Platform } from "@/types/domain";

export const DEMO_ORG_ID = "org_sketchdeck_demo";

export interface DemoCampaignDef {
  id: string;
  platform: Platform;
  name: string;
  objective: CampaignObjective;
  dailyBudget: number;
  country: string;
  industry: string;
  icpSegment: string;
  channelType: string;
  profile: PerformanceProfile;
  status?: CampaignStatus;
  /** Weight vectors used to allocate results across ICP dimensions. */
  audience: {
    seniority: Record<string, number>;
    companySize: Record<string, number>;
    jobTitle: Record<string, number>;
    geography: Record<string, number>;
  };
  /** Pipeline per opportunity in $ before profile multiplier. */
  dealSize: number;
  isPaidSocial: boolean;
}

const US = { Texas: 0.28, Midwest: 0.22, Southeast: 0.2, Northeast: 0.15, "West Coast": 0.15 };
const CA = { Alberta: 0.55, Ontario: 0.45 };
const USCA = { Texas: 0.22, Midwest: 0.18, Southeast: 0.15, Northeast: 0.12, "West Coast": 0.12, Alberta: 0.12, Ontario: 0.09 };

const MGR_HEAVY = { "Owner / C-level": 0.1, VP: 0.1, Director: 0.2, Manager: 0.4, "Individual contributor": 0.2 };
const VP_HEAVY = { "Owner / C-level": 0.25, VP: 0.45, Director: 0.2, Manager: 0.08, "Individual contributor": 0.02 };
const OWNER_HEAVY = { "Owner / C-level": 0.55, VP: 0.15, Director: 0.15, Manager: 0.1, "Individual contributor": 0.05 };
const MIXED = { "Owner / C-level": 0.18, VP: 0.15, Director: 0.22, Manager: 0.3, "Individual contributor": 0.15 };

const SMB = { "10–50 employees": 0.5, "51–200 employees": 0.35, "201–500 employees": 0.1, "500+ employees": 0.05 };
const MID = { "10–50 employees": 0.2, "51–200 employees": 0.45, "201–500 employees": 0.25, "500+ employees": 0.1 };
const ENT = { "10–50 employees": 0.03, "51–200 employees": 0.12, "201–500 employees": 0.35, "500+ employees": 0.5 };

const EST_TITLES = { "Chief Estimator": 0.35, "Estimating Manager": 0.3, "VP of Estimating": 0.1, "Owner / President": 0.1, "Preconstruction Director": 0.05, "Project Manager": 0.05, "Steel Detailer": 0.05 };
const VP_TITLES = { "Chief Estimator": 0.15, "Estimating Manager": 0.05, "VP of Estimating": 0.45, "Owner / President": 0.2, "Preconstruction Director": 0.1, "Project Manager": 0.03, "Steel Detailer": 0.02 };
const OWNER_TITLES = { "Chief Estimator": 0.15, "Estimating Manager": 0.1, "VP of Estimating": 0.05, "Owner / President": 0.6, "Preconstruction Director": 0.05, "Project Manager": 0.03, "Steel Detailer": 0.02 };
const GC_TITLES = { "Chief Estimator": 0.2, "Estimating Manager": 0.15, "VP of Estimating": 0.05, "Owner / President": 0.05, "Preconstruction Director": 0.45, "Project Manager": 0.08, "Steel Detailer": 0.02 };
const DET_TITLES = { "Chief Estimator": 0.1, "Estimating Manager": 0.05, "VP of Estimating": 0.02, "Owner / President": 0.05, "Preconstruction Director": 0.03, "Project Manager": 0.15, "Steel Detailer": 0.6 };
const BROAD_TITLES = { "Chief Estimator": 0.2, "Estimating Manager": 0.2, "VP of Estimating": 0.05, "Owner / President": 0.1, "Preconstruction Director": 0.05, "Project Manager": 0.25, "Steel Detailer": 0.15 };

export const DEMO_CAMPAIGNS: DemoCampaignDef[] = [
  // ───────────────────────── Google Ads ─────────────────────────
  {
    id: "cmp_g_core_phrases", platform: "google", name: "USA,CA | Core Phrases | Search | Steel Takeoff Software",
    objective: "demo_requests", dailyBudget: 630, country: "USA, Canada", industry: "Structural Steel Fabrication",
    icpSegment: "Estimators searching for takeoff software", channelType: "Search", profile: "high_performing",
    audience: { seniority: MIXED, companySize: MID, jobTitle: EST_TITLES, geography: USCA }, dealSize: 48_000, isPaidSocial: false,
  },
  {
    id: "cmp_g_brand", platform: "google", name: "USA,CA | Search | Brand | SketchDeck & LIFT",
    objective: "brand", dailyBudget: 90, country: "USA, Canada", industry: "Structural Steel Fabrication",
    icpSegment: "Brand searchers", channelType: "Search", profile: "average",
    audience: { seniority: MIXED, companySize: MID, jobTitle: EST_TITLES, geography: USCA }, dealSize: 30_000, isPaidSocial: false,
  },
  {
    id: "cmp_g_competitors", platform: "google", name: "USA,CA | Search | Competitors | Tekla, SDS/2, Bluebeam, STACK",
    objective: "competitor_conquest", dailyBudget: 270, country: "USA, Canada", industry: "Structural Steel Fabrication",
    icpSegment: "Competitor tool evaluators", channelType: "Search", profile: "high_cpl_excellent_sql",
    audience: { seniority: VP_HEAVY, companySize: MID, jobTitle: EST_TITLES, geography: USCA }, dealSize: 39_000, isPaidSocial: false,
  },
  {
    id: "cmp_g_metal_building", platform: "google", name: "USA | Search | Metal Building Estimating",
    objective: "demo_requests", dailyBudget: 240, country: "USA", industry: "Metal Building Manufacturing",
    icpSegment: "Metal building estimators", channelType: "Search", profile: "average",
    audience: { seniority: MGR_HEAVY, companySize: MID, jobTitle: EST_TITLES, geography: US }, dealSize: 28_000, isPaidSocial: false,
  },
  {
    id: "cmp_g_structural_est", platform: "google", name: "USA | Search | Structural Steel Estimating",
    objective: "demo_requests", dailyBudget: 360, country: "USA", industry: "Structural Steel Fabrication",
    icpSegment: "Structural estimators", channelType: "Search", profile: "fatiguing",
    audience: { seniority: MIXED, companySize: MID, jobTitle: EST_TITLES, geography: US }, dealSize: 32_000, isPaidSocial: false,
  },
  {
    id: "cmp_g_fab_estimating", platform: "google", name: "USA,CA | Search | Fabrication Estimating Software",
    objective: "lead_gen", dailyBudget: 210, country: "USA, Canada", industry: "Miscellaneous Metals",
    icpSegment: "Misc-metals estimators", channelType: "Search", profile: "underperforming",
    audience: { seniority: MGR_HEAVY, companySize: SMB, jobTitle: BROAD_TITLES, geography: USCA }, dealSize: 20_000, isPaidSocial: false,
  },
  {
    id: "cmp_g_display_rtg", platform: "google", name: "USA | Display | Fabricator Retargeting",
    objective: "retargeting", dailyBudget: 140, country: "USA", industry: "Structural Steel Fabrication",
    icpSegment: "Site visitors", channelType: "Display", profile: "high_ctr_poor_quality",
    audience: { seniority: MGR_HEAVY, companySize: SMB, jobTitle: BROAD_TITLES, geography: US }, dealSize: 21_000, isPaidSocial: true,
  },
  {
    id: "cmp_g_demand_gen", platform: "google", name: "USA,CA | Demand Gen | LIFT Product Video",
    objective: "awareness", dailyBudget: 170, country: "USA, Canada", industry: "Structural Steel Fabrication",
    icpSegment: "In-market construction software", channelType: "Demand Gen", profile: "underperforming",
    audience: { seniority: MGR_HEAVY, companySize: SMB, jobTitle: BROAD_TITLES, geography: USCA }, dealSize: 21_000, isPaidSocial: true,
  },
  {
    id: "cmp_g_pmax", platform: "google", name: "USA | Performance Max | Estimator Lead Gen",
    objective: "lead_gen", dailyBudget: 300, country: "USA", industry: "Structural Steel Fabrication",
    icpSegment: "Estimator lead forms", channelType: "Performance Max", profile: "fatiguing",
    audience: { seniority: MGR_HEAVY, companySize: SMB, jobTitle: BROAD_TITLES, geography: US }, dealSize: 23_000, isPaidSocial: true,
  },
  // ───────────────────────── Meta Ads ─────────────────────────
  {
    id: "cmp_m_retargeting", platform: "meta", name: "Meta | Retargeting | Website Visitors 30d",
    objective: "retargeting", dailyBudget: 180, country: "USA, Canada", industry: "Structural Steel Fabrication",
    icpSegment: "Site visitors", channelType: "Paid Social", profile: "average",
    audience: { seniority: MGR_HEAVY, companySize: MID, jobTitle: EST_TITLES, geography: USCA }, dealSize: 27_000, isPaidSocial: true,
  },
  {
    id: "cmp_m_video_views", platform: "meta", name: "Meta | Video Views | LIFT Takeoff Demo",
    objective: "awareness", dailyBudget: 230, country: "USA", industry: "Structural Steel Fabrication",
    icpSegment: "Construction interest audiences", channelType: "Paid Social", profile: "high_ctr_poor_quality",
    audience: { seniority: MGR_HEAVY, companySize: SMB, jobTitle: BROAD_TITLES, geography: US }, dealSize: 18_000, isPaidSocial: true,
  },
  {
    id: "cmp_m_lookalike", platform: "meta", name: "Meta | Lookalike 1% | Existing LIFT Customers",
    objective: "lead_gen", dailyBudget: 270, country: "USA", industry: "Structural Steel Fabrication",
    icpSegment: "Customer lookalikes", channelType: "Paid Social", profile: "average",
    audience: { seniority: MIXED, companySize: MID, jobTitle: EST_TITLES, geography: US }, dealSize: 28_000, isPaidSocial: true,
  },
  {
    id: "cmp_m_metalcon", platform: "meta", name: "Meta | METALCON 2026 | Booth Follow-up",
    objective: "retargeting", dailyBudget: 120, country: "USA", industry: "Metal Building Manufacturing",
    icpSegment: "Trade show attendees", channelType: "Paid Social", profile: "underperforming",
    audience: { seniority: MGR_HEAVY, companySize: MID, jobTitle: BROAD_TITLES, geography: US }, dealSize: 24_000, isPaidSocial: true,
  },
  {
    id: "cmp_m_lead_form", platform: "meta", name: "Meta | Lead Form | Free Trial on Your Next Bid",
    objective: "lead_gen", dailyBudget: 330, country: "USA, Canada", industry: "Miscellaneous Metals",
    icpSegment: "Instant-form leads", channelType: "Paid Social", profile: "high_ctr_poor_quality",
    audience: { seniority: MGR_HEAVY, companySize: SMB, jobTitle: BROAD_TITLES, geography: USCA }, dealSize: 17_000, isPaidSocial: true,
  },
  {
    id: "cmp_m_interest", platform: "meta", name: "Meta | Interest Targeting | Chief Estimators",
    objective: "lead_gen", dailyBudget: 150, country: "USA", industry: "Structural Steel Fabrication",
    icpSegment: "Interest-based estimators", channelType: "Paid Social", profile: "underperforming",
    audience: { seniority: MGR_HEAVY, companySize: SMB, jobTitle: BROAD_TITLES, geography: US }, dealSize: 20_000, isPaidSocial: true,
  },
  // ───────────────────────── LinkedIn Ads ─────────────────────────
  {
    id: "cmp_l_chief_estimators", platform: "linkedin", name: "LinkedIn | Chief Estimators | Steel Fabrication 50+",
    objective: "demo_requests", dailyBudget: 570, country: "USA, Canada", industry: "Structural Steel Fabrication",
    icpSegment: "Chief Estimators", channelType: "Sponsored Content", profile: "high_performing",
    audience: { seniority: VP_HEAVY, companySize: MID, jobTitle: EST_TITLES, geography: USCA }, dealSize: 44_000, isPaidSocial: true,
  },
  {
    id: "cmp_l_vp_enterprise", platform: "linkedin", name: "LinkedIn | VP Estimating | Enterprise Fabricators 500+",
    objective: "demo_requests", dailyBudget: 680, country: "USA", industry: "Structural Steel Fabrication",
    icpSegment: "Enterprise VP-level buyers", channelType: "Sponsored Content", profile: "low_ctr_excellent_pipeline",
    audience: { seniority: VP_HEAVY, companySize: ENT, jobTitle: VP_TITLES, geography: US }, dealSize: 77_000, isPaidSocial: true,
  },
  {
    id: "cmp_l_owners", platform: "linkedin", name: "LinkedIn | Owners & Presidents | Fab Shops 10–200",
    objective: "demo_requests", dailyBudget: 450, country: "USA, Canada", industry: "Structural Steel Fabrication",
    icpSegment: "Fab shop owners", channelType: "Sponsored Content", profile: "high_performing",
    audience: { seniority: OWNER_HEAVY, companySize: SMB, jobTitle: OWNER_TITLES, geography: USCA }, dealSize: 31_000, isPaidSocial: true,
  },
  {
    id: "cmp_l_metal_building", platform: "linkedin", name: "LinkedIn | Metal Building Manufacturers | Estimating Leaders",
    objective: "demo_requests", dailyBudget: 360, country: "USA", industry: "Metal Building Manufacturing",
    icpSegment: "Metal building estimating leaders", channelType: "Sponsored Content", profile: "average",
    audience: { seniority: MIXED, companySize: MID, jobTitle: EST_TITLES, geography: US }, dealSize: 37_000, isPaidSocial: true,
  },
  {
    id: "cmp_l_precon", platform: "linkedin", name: "LinkedIn | Preconstruction Directors | General Contractors",
    objective: "demo_requests", dailyBudget: 390, country: "USA", industry: "General Contracting",
    icpSegment: "GC preconstruction", channelType: "Sponsored Content", profile: "high_cpl_excellent_sql",
    audience: { seniority: VP_HEAVY, companySize: ENT, jobTitle: GC_TITLES, geography: US }, dealSize: 55_000, isPaidSocial: true,
  },
  {
    id: "cmp_l_aisc_abm", platform: "linkedin", name: "LinkedIn | AISC Member Firms | ABM Account List",
    objective: "demo_requests", dailyBudget: 480, country: "USA", industry: "Structural Steel Fabrication",
    icpSegment: "AISC-certified fabricators (ABM)", channelType: "Sponsored Content", profile: "low_ctr_excellent_pipeline",
    audience: { seniority: VP_HEAVY, companySize: ENT, jobTitle: VP_TITLES, geography: US }, dealSize: 67_000, isPaidSocial: true,
  },
  {
    id: "cmp_l_detailers", platform: "linkedin", name: "LinkedIn | Detailers & Engineers | Awareness",
    objective: "awareness", dailyBudget: 210, country: "USA, Canada", industry: "Steel Detailing & Engineering",
    icpSegment: "Detailers & engineers", channelType: "Sponsored Content", profile: "underperforming",
    audience: { seniority: MGR_HEAVY, companySize: SMB, jobTitle: DET_TITLES, geography: USCA }, dealSize: 16_000, isPaidSocial: true,
  },
  {
    id: "cmp_l_canada", platform: "linkedin", name: "LinkedIn | Canada | Alberta & Ontario Fabricators",
    objective: "demo_requests", dailyBudget: 300, country: "Canada", industry: "Structural Steel Fabrication",
    icpSegment: "Canadian fabricators", channelType: "Sponsored Content", profile: "average",
    audience: { seniority: MIXED, companySize: MID, jobTitle: EST_TITLES, geography: CA }, dealSize: 32_000, isPaidSocial: true,
  },
  {
    id: "cmp_l_mof_retargeting", platform: "linkedin", name: "LinkedIn | MOF Retargeting | Case Study: Fabricator ROI",
    objective: "retargeting", dailyBudget: 260, country: "USA, Canada", industry: "Structural Steel Fabrication",
    icpSegment: "Engaged mid-funnel accounts", channelType: "Sponsored Content", profile: "fatiguing",
    audience: { seniority: VP_HEAVY, companySize: MID, jobTitle: EST_TITLES, geography: USCA }, dealSize: 41_000, isPaidSocial: true,
  },
  {
    id: "cmp_l_pilot_paused", platform: "linkedin", name: "LinkedIn | OCT 2025 Pilot | SketchDeck Awareness (paused)",
    objective: "awareness", dailyBudget: 0, country: "USA", industry: "Structural Steel Fabrication",
    icpSegment: "Pilot audience", channelType: "Sponsored Content", profile: "underperforming", status: "paused",
    audience: { seniority: MGR_HEAVY, companySize: SMB, jobTitle: BROAD_TITLES, geography: US }, dealSize: 16_000, isPaidSocial: true,
  },
];

export function toCampaign(def: DemoCampaignDef, startedAt: string): Campaign {
  return {
    id: def.id,
    organizationId: DEMO_ORG_ID,
    platform: def.platform,
    externalId: `demo-${def.id.replace("cmp_", "")}`,
    name: def.name,
    status: def.status ?? "active",
    objective: def.objective,
    dailyBudget: def.dailyBudget,
    currency: "USD",
    country: def.country,
    industry: def.industry,
    icpSegment: def.icpSegment,
    channelType: def.channelType,
    startedAt,
    profile: def.profile,
  };
}

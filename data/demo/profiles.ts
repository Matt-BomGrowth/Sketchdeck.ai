import type { PerformanceProfile } from "@/types/domain";

/**
 * Unit-economics parameters for each performance profile.
 * These are used to generate realistic, differentiated campaigns so the
 * product can demonstrate that it does NOT optimize on CTR alone.
 */
export interface ProfileParams {
  ctr: number; // clicks / impressions
  cpc: number; // $ per click
  clickToLead: number;
  leadToMql: number;
  mqlToSql: number;
  sqlToOpp: number;
  /** Multiplier on the segment's pipeline-per-opportunity. */
  dealSizeMult: number;
  winRate: number; // revenue / pipeline
  /** Linear trend in CTR over the last `fatigueDays` (negative = decaying). */
  ctrTrend: number;
  cpcTrend: number;
  fatigueDays: number;
  frequencyBase?: number;
  frequencyTrend?: number;
}

export const PROFILES: Record<PerformanceProfile, ProfileParams> = {
  high_performing: {
    ctr: 0.034, cpc: 9.5, clickToLead: 0.052, leadToMql: 0.47, mqlToSql: 0.27, sqlToOpp: 0.44,
    dealSizeMult: 1.25, winRate: 0.22, ctrTrend: 0.04, cpcTrend: -0.02, fatigueDays: 21,
  },
  average: {
    ctr: 0.024, cpc: 8.0, clickToLead: 0.040, leadToMql: 0.34, mqlToSql: 0.18, sqlToOpp: 0.35,
    dealSizeMult: 1.0, winRate: 0.19, ctrTrend: 0, cpcTrend: 0.01, fatigueDays: 21,
  },
  underperforming: {
    ctr: 0.017, cpc: 10.5, clickToLead: 0.028, leadToMql: 0.26, mqlToSql: 0.1, sqlToOpp: 0.25,
    dealSizeMult: 0.8, winRate: 0.13, ctrTrend: -0.03, cpcTrend: 0.05, fatigueDays: 21,
  },
  fatiguing: {
    ctr: 0.031, cpc: 7.5, clickToLead: 0.045, leadToMql: 0.37, mqlToSql: 0.19, sqlToOpp: 0.34,
    dealSizeMult: 1.0, winRate: 0.17, ctrTrend: -0.55, cpcTrend: 0.35, fatigueDays: 18,
    frequencyBase: 2.4, frequencyTrend: 2.6,
  },
  high_ctr_poor_quality: {
    ctr: 0.062, cpc: 3.2, clickToLead: 0.075, leadToMql: 0.19, mqlToSql: 0.06, sqlToOpp: 0.22,
    dealSizeMult: 0.6, winRate: 0.1, ctrTrend: 0.02, cpcTrend: 0.0, fatigueDays: 21,
  },
  low_ctr_excellent_pipeline: {
    ctr: 0.009, cpc: 24.0, clickToLead: 0.06, leadToMql: 0.53, mqlToSql: 0.34, sqlToOpp: 0.53,
    dealSizeMult: 1.9, winRate: 0.26, ctrTrend: 0.01, cpcTrend: 0.0, fatigueDays: 21,
  },
  high_cpl_excellent_sql: {
    ctr: 0.021, cpc: 16.0, clickToLead: 0.030, leadToMql: 0.56, mqlToSql: 0.38, sqlToOpp: 0.49,
    dealSizeMult: 1.4, winRate: 0.24, ctrTrend: 0.0, cpcTrend: 0.01, fatigueDays: 21,
  },
};

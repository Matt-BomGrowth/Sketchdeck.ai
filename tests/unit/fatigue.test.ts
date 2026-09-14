import { describe, it, expect } from "vitest";
import { assessFatigue, DEFAULT_FATIGUE_THRESHOLDS } from "@/agent/detectors/fatigue";
import { buildSeries } from "../helpers/series";

const END = "2026-09-13";

describe("assessFatigue", () => {
  it("reports healthy with a stable series", () => {
    const series = buildSeries("cmp_stable", END, 30, () => ({ ctr: 0.03, cpc: 8 }));
    const a = assessFatigue(series);
    expect(a.status).toBe("healthy");
    expect(a.score).toBe(0);
    expect(a.reasons).toEqual(["Performance is stable or improving vs. baseline."]);
    expect(a.signals.find((s) => s.key === "ctr")?.direction).toBe("flat");
  });

  it("flags critical when CTR collapses below the 1.5% floor over the last ~48h", () => {
    const series = buildSeries("cmp_fatigued", END, 30, (_, daysFromEnd) =>
      daysFromEnd < 2
        ? { ctr: 0.011, cpc: 12, clickToLead: 0.02 } // collapsed
        : { ctr: 0.03, cpc: 8, clickToLead: 0.05 },
    );
    const a = assessFatigue(series);
    expect(a.status).toBe("critical");
    expect(a.score).toBeGreaterThanOrEqual(60);
    expect(a.reasons.some((r) => /below the 1\.5% floor/.test(r))).toBe(true);
    expect(a.reasons.some((r) => /CTR fell/.test(r))).toBe(true);
    const ctrSig = a.signals.find((s) => s.key === "ctr")!;
    expect(ctrSig.direction).toBe("worse");
    expect(ctrSig.change).toBeLessThan(-0.15);
  });

  it("warns when CTR slips toward the floor without a full deterioration", () => {
    // 2.0% → 1.75%: inside criticalCtr + warningCtrBand (1.9%) with a 12.5% drop (below the 15% deterioration bar).
    const series = buildSeries("cmp_near_floor", END, 30, (_, daysFromEnd) => ({ ctr: daysFromEnd < 2 ? 0.0175 : 0.02 }));
    const a = assessFatigue(series);
    expect(a.status).toBe("warning");
    expect(a.reasons.some((r) => /approaching the 1\.5% floor/.test(r))).toBe(true);
    expect(a.reasons.some((r) => /CTR trending down 1[23]%/.test(r))).toBe(true);
  });

  it("treats fatigue as a change, not a level: a flat low-CTR campaign is healthy", () => {
    // LinkedIn ABM at a steady 0.9% has never cleared the floor, so the floor does not apply.
    const abm = buildSeries("cmp_abm", END, 30, () => ({ ctr: 0.009, cpc: 24 }));
    const a = assessFatigue(abm);
    expect(a.status).toBe("healthy");
    expect(a.score).toBe(0);
    // Same for a flat 1.7% (inside the warning band but not moving).
    const flatNear = buildSeries("cmp_flat_near", END, 30, () => ({ ctr: 0.017 }));
    expect(assessFatigue(flatNear).status).toBe("healthy");
  });

  it("returns healthy with an explanatory reason when history is insufficient", () => {
    const short = buildSeries("cmp_new", END, 3);
    const a = assessFatigue(short);
    expect(a.status).toBe("healthy");
    expect(a.score).toBe(0);
    expect(a.signals).toEqual([]);
    expect(a.reasons).toEqual(["Insufficient history for fatigue analysis."]);
  });

  it("returns healthy for an empty series", () => {
    const a = assessFatigue([]);
    expect(a.status).toBe("healthy");
    expect(a.reasons[0]).toMatch(/Insufficient history/);
  });

  it("respects custom thresholds", () => {
    // 3.2% → 2.5%: a 22% drop.
    const series = buildSeries("cmp_custom", END, 30, (_, daysFromEnd) =>
      daysFromEnd < 2 ? { ctr: 0.025 } : { ctr: 0.032 },
    );
    const def = assessFatigue(series);
    expect(def.status).toBe("warning"); // deteriorating, but not below the 1.5% floor
    const strict = assessFatigue(series, { ...DEFAULT_FATIGUE_THRESHOLDS, criticalCtr: 0.03, deteriorationPct: 0.1 });
    expect(strict.status).toBe("critical");
    const lax = assessFatigue(series, { ...DEFAULT_FATIGUE_THRESHOLDS, criticalCtr: 0.005, warningCtrBand: 0.001, deteriorationPct: 0.5 });
    expect(lax.status).toBe("healthy");
  });

  it("uses the configured lookback window", () => {
    const series = buildSeries("cmp_lookback", END, 30, (_, daysFromEnd) => (daysFromEnd < 5 ? { ctr: 0.01 } : { ctr: 0.03 }));
    const wide = assessFatigue(series, { ...DEFAULT_FATIGUE_THRESHOLDS, lookbackDays: 5 });
    expect(wide.status).toBe("critical");
  });

  it("flags frequency above the maximum for paid social only", () => {
    const series = buildSeries("cmp_social", END, 30, (_, daysFromEnd) => ({ frequency: daysFromEnd < 2 ? 5.2 : 2.0 }));
    const social = assessFatigue(series, DEFAULT_FATIGUE_THRESHOLDS, { isPaidSocial: true });
    const freq = social.signals.find((s) => s.key === "frequency");
    expect(freq).toBeDefined();
    expect(freq!.current).toBeGreaterThan(DEFAULT_FATIGUE_THRESHOLDS.maxFrequency);
    expect(freq!.direction).toBe("worse");
    expect(social.reasons.some((r) => /Frequency 5\.2 exceeds 4/.test(r))).toBe(true);
    expect(social.score).toBeGreaterThanOrEqual(15);
    expect(social.status).toBe("warning");

    const search = assessFatigue(series, DEFAULT_FATIGUE_THRESHOLDS, { isPaidSocial: false });
    expect(search.signals.find((s) => s.key === "frequency")).toBeUndefined();
    expect(search.reasons.some((r) => /Frequency/.test(r))).toBe(false);
    expect(search.status).toBe("healthy");
  });

  it("escalates high frequency to critical when CTR is also deteriorating", () => {
    const series = buildSeries("cmp_social_fatigued", END, 30, (_, daysFromEnd) =>
      daysFromEnd < 2 ? { frequency: 5.5, ctr: 0.02 } : { frequency: 2.0, ctr: 0.03 },
    );
    const a = assessFatigue(series, DEFAULT_FATIGUE_THRESHOLDS, { isPaidSocial: true });
    expect(a.status).toBe("critical");
  });

  it("caps the score at 100", () => {
    const series = buildSeries("cmp_worst", END, 30, (_, daysFromEnd) =>
      daysFromEnd < 2
        ? { ctr: 0.005, cpc: 20, clickToLead: 0.01, frequency: 8, mqlToSql: 0.05 }
        : { ctr: 0.03, cpc: 8, clickToLead: 0.1, frequency: 2, mqlToSql: 0.4 },
    );
    const a = assessFatigue(series, DEFAULT_FATIGUE_THRESHOLDS, { isPaidSocial: true });
    expect(a.score).toBeLessThanOrEqual(100);
    expect(a.score).toBeGreaterThan(60);
    expect(a.status).toBe("critical");
  });

  it("never reports critical on thin recent volume", () => {
    // Collapsed CTR but only ~5 clicks/day in the recent window (< minRecentClicks).
    const series = buildSeries("cmp_thin", END, 30, (_, daysFromEnd) =>
      daysFromEnd < 2 ? { ctr: 0.005, spend: 100, cpc: 20 } : { ctr: 0.03, spend: 800, cpc: 8 },
    );
    const a = assessFatigue(series);
    expect(a.status).not.toBe("critical");
    expect(a.score).toBeLessThanOrEqual(45);
    if (a.status === "warning") expect(a.reasons.some((r) => /Low recent volume/.test(r))).toBe(true);

    // Raising the volume floor to zero restores the critical verdict for the same series.
    const noGuard = assessFatigue(series, { ...DEFAULT_FATIGUE_THRESHOLDS, minRecentImpressions: 0, minRecentClicks: 0 });
    expect(noGuard.status).toBe("critical");
  });
});

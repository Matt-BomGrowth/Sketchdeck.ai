import { describe, it, expect } from "vitest";
import { detectAnomalies } from "@/agent/detectors/anomaly";
import { buildSeries } from "../helpers/series";

const END = "2026-09-13";

describe("detectAnomalies", () => {
  it("returns no anomalies on a flat series", () => {
    const series = buildSeries("cmp_flat", END, 20);
    expect(detectAnomalies(series)).toEqual([]);
  });

  it("returns [] when there is insufficient history", () => {
    const series = buildSeries("cmp_short", END, 10, (_, d) => (d === 0 ? { spend: 5000 } : {}));
    expect(detectAnomalies(series)).toEqual([]);
    // Exactly baselineDays rows is still insufficient (needs baseline + 1).
    const exact = buildSeries("cmp_short", END, 14, (_, d) => (d === 0 ? { spend: 5000 } : {}));
    expect(detectAnomalies(exact)).toEqual([]);
  });

  it("detects a spend spike on the last day vs the 14-day baseline", () => {
    const series = buildSeries("cmp_spike", END, 20, (_, d) => (d === 0 ? { spend: 1500 } : { spend: 300 }));
    const out = detectAnomalies(series);
    const spend = out.find((a) => a.metric === "spend");
    expect(spend).toBeDefined();
    expect(spend!.direction).toBe("spike");
    expect(spend!.campaignId).toBe("cmp_spike");
    expect(spend!.date).toBe(END);
    expect(spend!.value).toBe(1500);
    expect(spend!.expected).toBe(300);
    expect(spend!.zScore).toBeGreaterThan(3);
    expect(["high", "medium"]).toContain(spend!.severity);
  });

  it("detects a drop on the last day", () => {
    const series = buildSeries("cmp_drop", END, 20, (_, d) => (d === 0 ? { spend: 20 } : { spend: 300 }));
    const out = detectAnomalies(series);
    const spend = out.find((a) => a.metric === "spend");
    expect(spend).toBeDefined();
    expect(spend!.direction).toBe("drop");
    expect(spend!.zScore).toBeLessThan(-3);
  });

  it("only inspects the last day, not earlier outliers", () => {
    const series = buildSeries("cmp_mid", END, 20, (_, d) => (d === 5 ? { spend: 5000 } : { spend: 300 }));
    const out = detectAnomalies(series);
    expect(out.find((a) => a.metric === "spend")).toBeUndefined();
  });

  it("ignores tiny absolute changes even when variance is zero", () => {
    // Baseline is perfectly flat so MAD = 0 → fallback; a +1 change should not be an anomaly.
    const series = buildSeries("cmp_tiny", END, 20, (_, d) => (d === 0 ? { spend: 301 } : { spend: 300 }));
    expect(detectAnomalies(series, { metrics: ["spend"] })).toEqual([]);
  });

  it("honours metric selection and threshold options", () => {
    const series = buildSeries("cmp_opts", END, 20, (_, d) => (d === 0 ? { spend: 1500 } : { spend: 300 }));
    expect(detectAnomalies(series, { metrics: ["leads"] }).find((a) => a.metric === "spend")).toBeUndefined();
    expect(detectAnomalies(series, { metrics: ["spend"], threshold: 1000 })).toEqual([]);
  });
});

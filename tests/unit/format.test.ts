import { describe, it, expect } from "vitest";
import { fmtCurrency, fmtCompactCurrency, fmtPct, fmtSignedPct, fmtMultiple, fmtNumber, fmtCompactNumber, fmtDate, DASH, PLATFORM_LABEL } from "@/lib/utils/format";

describe("format: null safety", () => {
  it("returns a dash for null, undefined, NaN and Infinity", () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(fmtCurrency(v)).toBe(DASH);
      expect(fmtCompactCurrency(v)).toBe(DASH);
      expect(fmtPct(v)).toBe(DASH);
      expect(fmtSignedPct(v)).toBe(DASH);
      expect(fmtMultiple(v)).toBe(DASH);
      expect(fmtNumber(v)).toBe(DASH);
      expect(fmtCompactNumber(v)).toBe(DASH);
    }
    expect(DASH).toBe("—");
  });
});

describe("fmtCurrency", () => {
  it("formats whole dollars by default and cents on request", () => {
    expect(fmtCurrency(1234.56)).toBe("$1,235");
    expect(fmtCurrency(1234.56, { cents: true })).toBe("$1,234.56");
    expect(fmtCurrency(0)).toBe("$0");
    expect(fmtCurrency(-50)).toBe("-$50");
  });

  it("delegates to compact formatting", () => {
    expect(fmtCurrency(1_500_000, { compact: true })).toBe("$1.50M");
  });
});

describe("fmtCompactCurrency", () => {
  it("scales K/M with sign", () => {
    expect(fmtCompactCurrency(999)).toBe("$999");
    expect(fmtCompactCurrency(1_500)).toBe("$1.5K");
    expect(fmtCompactCurrency(12_400)).toBe("$12K");
    expect(fmtCompactCurrency(1_500_000)).toBe("$1.50M");
    expect(fmtCompactCurrency(12_345_678)).toBe("$12.3M");
    expect(fmtCompactCurrency(-2_500)).toBe("-$2.5K");
  });
});

describe("fmtPct / fmtSignedPct / fmtMultiple", () => {
  it("formats fractions as percentages", () => {
    expect(fmtPct(0.1234)).toBe("12.3%");
    expect(fmtPct(0.1234, 2)).toBe("12.34%");
    expect(fmtPct(0)).toBe("0.0%");
  });

  it("adds a sign for positive changes", () => {
    expect(fmtSignedPct(0.25)).toBe("+25%");
    expect(fmtSignedPct(-0.25)).toBe("-25%");
    expect(fmtSignedPct(0)).toBe("0%");
  });

  it("formats multiples with ×", () => {
    expect(fmtMultiple(2.345)).toBe("2.3×");
    expect(fmtMultiple(2.345, 2)).toBe("2.35×");
  });
});

describe("fmtNumber / fmtCompactNumber / fmtDate", () => {
  it("formats plain numbers", () => {
    expect(fmtNumber(1234567.8)).toBe("1,234,568");
    expect(fmtCompactNumber(950)).toBe("950");
    expect(fmtCompactNumber(1_500)).toBe("1.5K");
    expect(fmtCompactNumber(25_000)).toBe("25K");
    expect(fmtCompactNumber(2_000_000)).toBe("2.0M");
  });

  it("formats dates in UTC", () => {
    expect(fmtDate("2026-09-13")).toBe("Sep 13");
    expect(fmtDate("2026-09-13T23:59:00.000Z", { month: "short", day: "numeric", year: "numeric" })).toBe("Sep 13, 2026");
  });

  it("labels platforms", () => {
    expect(PLATFORM_LABEL.google).toBe("Google Ads");
    expect(PLATFORM_LABEL.meta).toBe("Meta Ads");
    expect(PLATFORM_LABEL.linkedin).toBe("LinkedIn Ads");
  });
});

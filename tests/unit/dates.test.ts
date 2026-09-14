import { describe, it, expect } from "vitest";
import { toISODate, addDays, parseISODate, dateRange, windowEnding, previousWindow, presetToDays } from "@/lib/utils/dates";

describe("dates: primitives", () => {
  it("round-trips ISO dates in UTC", () => {
    expect(toISODate(parseISODate("2026-09-13"))).toBe("2026-09-13");
    expect(parseISODate("2026-09-13").toISOString()).toBe("2026-09-13T00:00:00.000Z");
  });

  it("addDays handles month and year boundaries without mutating input", () => {
    const d = parseISODate("2026-12-31");
    const next = addDays(d, 1);
    expect(toISODate(next)).toBe("2027-01-01");
    expect(toISODate(d)).toBe("2026-12-31");
    expect(toISODate(addDays(parseISODate("2026-03-01"), -1))).toBe("2026-02-28");
  });
});

describe("dateRange", () => {
  it("is inclusive of both ends", () => {
    expect(dateRange("2026-09-11", "2026-09-13")).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
  });

  it("returns a single day when start === end", () => {
    expect(dateRange("2026-09-13", "2026-09-13")).toEqual(["2026-09-13"]);
  });

  it("returns [] when start is after end", () => {
    expect(dateRange("2026-09-14", "2026-09-13")).toEqual([]);
  });
});

describe("windowEnding / previousWindow", () => {
  it("builds a window of the requested length ending on the given day", () => {
    const w = windowEnding("2026-09-13", 30);
    expect(w.end).toBe("2026-09-13");
    expect(w.start).toBe("2026-08-15");
    expect(w.days).toBe(30);
    expect(w.label).toBe("the last 30 days");
    expect(windowEnding("2026-09-13", 1).label).toBe("yesterday");
    expect(dateRange(w.start, w.end)).toHaveLength(30);
    expect(windowEnding("2026-09-13", 1).start).toBe("2026-09-13");
    expect(windowEnding("2026-09-13", 7, "last week").label).toBe("last week");
  });

  it("previousWindow is contiguous and non-overlapping with the same length", () => {
    const w = windowEnding("2026-09-13", 30);
    const p = previousWindow(w);
    expect(p.days).toBe(30);
    expect(p.end).toBe("2026-08-14");
    expect(p.start).toBe("2026-07-16");
    expect(toISODate(addDays(parseISODate(p.end), 1))).toBe(w.start);
    expect(p.end < w.start).toBe(true);
    const all = new Set([...dateRange(p.start, p.end), ...dateRange(w.start, w.end)]);
    expect(all.size).toBe(60);
    expect(p.label).toBe("the previous 30 days");
    expect(previousWindow(windowEnding("2026-09-13", 1)).label).toBe("the day before");
  });

  it("chains across year boundaries", () => {
    const w = windowEnding("2027-01-05", 7);
    const p = previousWindow(w);
    expect(w.start).toBe("2026-12-30");
    expect(p.end).toBe("2026-12-29");
    expect(p.start).toBe("2026-12-23");
  });
});

describe("presetToDays", () => {
  it("maps presets with 30d as default", () => {
    expect(presetToDays("7d")).toBe(7);
    expect(presetToDays("30d")).toBe(30);
    expect(presetToDays("90d")).toBe(90);
    expect(presetToDays(undefined)).toBe(30);
    expect(presetToDays("garbage")).toBe(30);
  });
});

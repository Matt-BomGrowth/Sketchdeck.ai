import { describe, it, expect } from "vitest";
import { createRng, hashString } from "@/lib/utils/prng";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 5 }, () => a.next())).not.toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it("next() stays within [0, 1)", () => {
    const r = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range() stays within [min, max)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it("int() returns integers within [min, max] inclusive and hits both ends", () => {
    const r = createRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it("pick() returns an element of the array", () => {
    const r = createRng(3);
    const arr = ["a", "b", "c"] as const;
    for (let i = 0; i < 100; i++) expect(arr).toContain(r.pick(arr));
  });

  it("binomial() respects bounds and degenerate probabilities", () => {
    const r = createRng(11);
    expect(r.binomial(10, 0)).toBe(0);
    expect(r.binomial(10, 1)).toBe(10);
    expect(r.binomial(0, 0.5)).toBe(0);
    for (let i = 0; i < 200; i++) {
      const small = r.binomial(50, 0.3);
      expect(small).toBeGreaterThanOrEqual(0);
      expect(small).toBeLessThanOrEqual(50);
      const large = r.binomial(1000, 0.3);
      expect(large).toBeGreaterThanOrEqual(0);
      expect(large).toBeLessThanOrEqual(1000);
      expect(Number.isInteger(large)).toBe(true);
    }
  });

  it("normal() is centred near the mean over many samples", () => {
    const r = createRng(5);
    let sum = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) sum += r.normal(10, 2);
    expect(sum / n).toBeCloseTo(10, 0);
  });
});

describe("hashString", () => {
  it("is stable for the same input", () => {
    expect(hashString("cmp_g_core_phrases:2026-05-17")).toBe(hashString("cmp_g_core_phrases:2026-05-17"));
  });

  it("returns an unsigned 32-bit integer", () => {
    for (const s of ["", "a", "hello world", "cmp_l_vp_enterprise"]) {
      const h = hashString(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("differs for different inputs", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
    expect(hashString("abc")).not.toBe(hashString("acb"));
  });

  it("matches the FNV-1a offset basis for the empty string", () => {
    expect(hashString("")).toBe(2166136261);
  });
});

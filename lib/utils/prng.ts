/**
 * Deterministic pseudo-random generator (mulberry32) so demo data is stable
 * across renders, tests, and deployments.
 */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Uniform float in [min, max). */
    range: (min: number, max: number) => min + next() * (max - min),
    /** Integer in [min, max]. */
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    /** Approx. normal distribution via Box–Muller. */
    normal: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    /** Binomial-ish sampling: number of successes out of n trials with prob p. */
    binomial: (n: number, p: number) => {
      if (n <= 0 || p <= 0) return 0;
      if (p >= 1) return n;
      if (n > 200) {
        const mean = n * p;
        const sd = Math.sqrt(n * p * (1 - p));
        const u = Math.max(next(), 1e-9);
        const v = next();
        const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        return Math.max(0, Math.min(n, Math.round(mean + sd * z)));
      }
      let k = 0;
      for (let i = 0; i < n; i++) if (next() < p) k++;
      return k;
    },
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

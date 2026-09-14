const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const num0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const DASH = "—";

export function fmtCurrency(value: number | null | undefined, opts: { compact?: boolean; cents?: boolean } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  if (opts.compact) return fmtCompactCurrency(value);
  return opts.cents ? usd2.format(value) : usd0.format(value);
}

export function fmtCompactCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000)}K`;
  if (abs >= 1_000) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return num0.format(value);
}

export function fmtCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(value / 1000)}K`;
  if (abs >= 1_000) return `${(value / 1000).toFixed(1)}K`;
  return num0.format(value);
}

export function fmtPct(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtSignedPct(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function fmtMultiple(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value.toFixed(digits)}×`;
}

export function fmtDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(d);
}

export function fmtDateTime(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

export function fmtRelative(iso: string | Date, now: Date = new Date()) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Math.round((d.getTime() - now.getTime()) / 60000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (abs < 60) return rtf.format(diff, "minute");
  if (abs < 60 * 24) return rtf.format(Math.round(diff / 60), "hour");
  return rtf.format(Math.round(diff / (60 * 24)), "day");
}

export const PLATFORM_LABEL: Record<string, string> = {
  google: "Google Ads",
  meta: "Meta Ads",
  linkedin: "LinkedIn Ads",
};

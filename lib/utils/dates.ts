export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export function parseISODate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Inclusive list of ISO dates from start to end. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = parseISODate(start);
  const last = parseISODate(end);
  while (cur.getTime() <= last.getTime()) {
    out.push(toISODate(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

export type WindowPreset = "7d" | "30d" | "90d";

export interface DateWindow {
  start: string;
  end: string;
  days: number;
  label: string;
}

/** Build a date window ending on `end` (inclusive). */
export function windowEnding(end: string, days: number, label?: string): DateWindow {
  const endDate = parseISODate(end);
  const start = toISODate(addDays(endDate, -(days - 1)));
  return { start, end, days, label: label ?? (days === 1 ? "yesterday" : `the last ${days} days`) };
}

export function previousWindow(w: DateWindow): DateWindow {
  const start = parseISODate(w.start);
  const prevEnd = toISODate(addDays(start, -1));
  return windowEnding(prevEnd, w.days, w.days === 1 ? "the day before" : `the previous ${w.days} days`);
}

export function presetToDays(preset: WindowPreset | string | undefined): number {
  switch (preset) {
    case "7d":
      return 7;
    case "90d":
      return 90;
    case "30d":
    default:
      return 30;
  }
}

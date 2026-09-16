import type { WeeklyReport } from "@/lib/reports/weekly";
import { REPORT_METRICS } from "@/lib/reports/weekly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricTile } from "./wow";

/** Section 1: blended performance across every connected platform. */
export function BlendedSection({ report }: { report: WeeklyReport }) {
  const b = report.blended;
  const connected = report.integrity.connectedPlatforms;
  const primary = REPORT_METRICS.filter((m) => ["spend", "conversions", "costPerConversion", "ctr"].includes(m.key));
  const secondary = REPORT_METRICS.filter((m) => !primary.includes(m));
  const value = (key: (typeof REPORT_METRICS)[number]["key"]) => b.metrics.find((m) => m.key === key)!;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Blended performance</CardTitle>
        <CardDescription>
          All connected ad platforms combined ({connected.length ? connected.map((p) => ({ google: "Google Ads", meta: "Meta Ads", linkedin: "LinkedIn Ads" })[p]).join(" + ") : "none"}). Rates are computed from the summed totals, not averaged.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {primary.map((def) => (
            <MetricTile key={def.key} def={def} current={value(def.key).current} previous={value(def.key).previous} size="lg" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {secondary.map((def) => {
            const v = value(def.key);
            const unavailable = def.platforms && !def.platforms.some((p) => connected.includes(p));
            return <MetricTile key={def.key} def={def} current={v.current} previous={v.previous} note={unavailable ? `Not available: ${def.hint} (${def.platforms!.map((p) => (p === "meta" ? "Meta" : "LinkedIn")).join(" / ")} not connected)` : def.platforms ? "Meta / LinkedIn only; sum of daily reach" : undefined} />;
          })}
        </div>
      </CardContent>
    </Card>
  );
}

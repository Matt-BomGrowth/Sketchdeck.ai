"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveSettings, type SettingsInput } from "./actions";
import { cn } from "@/lib/utils/cn";

function Field({ id, label, value, onChange, step = 1, hint, pct = false }: { id: keyof SettingsInput; label: string; value: number; onChange: (v: number) => void; step?: number; hint?: string; pct?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" step={step} value={pct ? Math.round(value * 1000) / 10 : value} onChange={(e) => onChange(pct ? Number(e.target.value) / 100 : Number(e.target.value))} className="tnum" />
        {pct ? <span className="text-xs text-muted">%</span> : null}
      </div>
      {hint ? <p className="text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function SettingsForm({ initial, canEdit }: { initial: SettingsInput; canEdit: boolean }) {
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof SettingsInput>(k: K) => (val: SettingsInput[K]) => setV((s) => ({ ...s, [k]: val }));

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSettings(v);
          setMsg({ ok: r.ok, text: r.message });
        });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Fatigue detection thresholds</CardTitle>
          <CardDescription>Critical = CTR below the floor AND meaningful deterioration over the lookback window. Warning = CTR approaching the floor OR a material downward trend.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="criticalCtr" label="Critical CTR floor" value={v.criticalCtr} onChange={set("criticalCtr")} step={0.1} pct hint="Default 1.5%" />
          <Field id="warningCtrBand" label="Warning band above floor" value={v.warningCtrBand} onChange={set("warningCtrBand")} step={0.1} pct hint="Default 0.4% → warn under 1.9%" />
          <Field id="deteriorationPct" label="Meaningful deterioration" value={v.deteriorationPct} onChange={set("deteriorationPct")} step={1} pct hint="CTR drop / CPC rise vs. baseline" />
          <Field id="lookbackDays" label="Lookback (days)" value={v.lookbackDays} onChange={set("lookbackDays")} hint="≈48 hours = 2" />
          <Field id="baselineDays" label="Baseline (days)" value={v.baselineDays} onChange={set("baselineDays")} />
          <Field id="maxFrequency" label="Max frequency (paid social)" value={v.maxFrequency} onChange={set("maxFrequency")} step={0.5} />
          <Field id="minRecentImpressions" label="Min recent impressions" value={v.minRecentImpressions} onChange={set("minRecentImpressions")} hint="Below this, never critical" />
          <Field id="minRecentClicks" label="Min recent clicks" value={v.minRecentClicks} onChange={set("minRecentClicks")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action safety &amp; automation</CardTitle>
          <CardDescription>Real advertising changes require approval by default. Auto-execution only applies to changes within every limit below.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="maxBudgetChangePct" label="Maximum budget change" value={v.maxBudgetChangePct} onChange={set("maxBudgetChangePct")} step={1} pct hint="Per action. Default 10%" />
          <Field id="maxDailyExposure" label="Maximum daily exposure ($)" value={v.maxDailyExposure} onChange={set("maxDailyExposure")} step={100} hint="Default $2,000" />
          <Field id="approvalRequiredAbove" label="Approval required above ($/month)" value={v.approvalRequiredAbove} onChange={set("approvalRequiredAbove")} step={500} hint="Default $5,000" />
          <div className="flex flex-col gap-2">
            <Label htmlFor="autoExecuteEnabled">Auto-execute within limits</Label>
            <div className="flex items-center gap-2">
              <Switch id="autoExecuteEnabled" checked={v.autoExecuteEnabled} onCheckedChange={set("autoExecuteEnabled")} />
              <span className="text-xs text-muted">{v.autoExecuteEnabled ? "On — small, in-limit changes execute without approval" : "Off — every live change requires approval"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canEdit || pending}>Save settings</Button>
        {!canEdit ? <span className="text-xs text-muted">Viewer role — read only.</span> : null}
        {msg ? <span className={cn("text-xs", msg.ok ? "text-positive" : "text-negative")}>{msg.text}</span> : null}
      </div>
    </form>
  );
}

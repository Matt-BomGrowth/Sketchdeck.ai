"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtCompactCurrency, fmtMultiple } from "@/lib/utils/format";

export interface PlatformBar {
  platform: string;
  label: string;
  spend: number;
  pipeline: number;
  pipelineRoas: number | null;
  sqls: number;
}

const COLOR: Record<string, string> = { google: "var(--google)", meta: "var(--meta)", linkedin: "var(--linkedin)" };

export function PlatformBarsChart({ data }: { data: PlatformBar[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={24}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => `${v}×`} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            formatter={(value, _name, item) => {
              const p = item.payload as PlatformBar;
              return [`${fmtMultiple(Number(value))} · ${fmtCompactCurrency(p.pipeline)} pipeline on ${fmtCompactCurrency(p.spend)} spend · ${p.sqls} SQLs`, "Pipeline ROAS"];
            }}
          />
          <Bar dataKey="pipelineRoas" name="Pipeline ROAS" radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.platform} fill={COLOR[d.platform] ?? "var(--chart-1)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
